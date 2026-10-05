// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFlowAUSD {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;

    function transfer(address to, uint256 value) external returns (bool);
}

/// @title FerryFlow
/// @notice Atomically routes a gasless AUSD payment according to its recipient's saved rule.
contract FerryFlow {
    uint256 public constant TOTAL_BASIS_POINTS = 10_000;
    uint256 public constant MAX_DESTINATIONS = 5;

    bytes32 public constant CONFIGURE_FLOW_TYPEHASH = keccak256(
        "ConfigureFlow(address owner,address[] destinations,uint256[] basisPoints,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant DISABLE_FLOW_TYPEHASH =
        keccak256("DisableFlow(address owner,uint256 nonce,uint256 deadline)");
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant NAME_HASH = keccak256("FerryFlow");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_DIV_2 = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    IFlowAUSD public immutable ausd;

    struct Rule {
        address[] destinations;
        uint256[] basisPoints;
    }

    mapping(address owner => Rule rule) private rules;
    mapping(address owner => uint256 nonce) public configurationNonces;

    event FlowConfigured(address indexed owner, uint256 indexed nonce, address[] destinations, uint256[] basisPoints);
    event FlowDisabled(address indexed owner, uint256 indexed nonce);
    event FlowExecuted(
        address indexed owner,
        address indexed from,
        uint256 value,
        bytes32 indexed authorizationNonce,
        uint256 destinationCount
    );
    event FlowDistribution(
        address indexed owner,
        bytes32 indexed authorizationNonce,
        address indexed destination,
        uint256 amount,
        uint256 destinationIndex
    );

    error ZeroAddress();
    error ZeroValue();
    error InvalidDestinationCount();
    error ArrayLengthMismatch();
    error ZeroBasisPoints();
    error InvalidBasisPointTotal();
    error DuplicateDestination();
    error InvalidConfigurationNonce(uint256 expected, uint256 provided);
    error SignatureExpired();
    error InvalidSignature();
    error AuthorizationOwnerMismatch();
    error TransferFailed();

    constructor(address ausd_) {
        if (ausd_ == address(0)) revert ZeroAddress();
        ausd = IFlowAUSD(ausd_);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function getFlow(address owner)
        external
        view
        returns (address[] memory destinations, uint256[] memory basisPoints)
    {
        Rule storage rule = rules[owner];
        return (rule.destinations, rule.basisPoints);
    }

    function hasFlow(address owner) external view returns (bool) {
        return rules[owner].destinations.length != 0;
    }

    /// @notice Returns the EIP-712 digest an owner signs for a relayed configuration.
    function configurationDigest(
        address owner,
        address[] calldata destinations,
        uint256[] calldata basisPoints,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                CONFIGURE_FLOW_TYPEHASH,
                owner,
                keccak256(abi.encodePacked(destinations)),
                keccak256(abi.encodePacked(basisPoints)),
                nonce,
                deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @notice Returns the EIP-712 digest an owner signs to remove their saved rule.
    function disableDigest(address owner, uint256 nonce, uint256 deadline) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(DISABLE_FLOW_TYPEHASH, owner, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @notice Stores a rule using the owner's deadline-bound, sequentially nonced signature.
    function configureFlow(
        address owner,
        address[] calldata destinations,
        uint256[] calldata basisPoints,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _validateRule(owner, destinations, basisPoints);
        if (block.timestamp > deadline) revert SignatureExpired();

        uint256 expectedNonce = configurationNonces[owner];
        if (nonce != expectedNonce) revert InvalidConfigurationNonce(expectedNonce, nonce);

        bytes32 digest = configurationDigest(owner, destinations, basisPoints, nonce, deadline);
        if (_recover(digest, v, r, s) != owner) revert InvalidSignature();

        configurationNonces[owner] = expectedNonce + 1;
        Rule storage rule = rules[owner];
        delete rule.destinations;
        delete rule.basisPoints;
        for (uint256 i; i < destinations.length; ++i) {
            rule.destinations.push(destinations[i]);
            rule.basisPoints.push(basisPoints[i]);
        }

        emit FlowConfigured(owner, nonce, destinations, basisPoints);
    }

    /// @notice Removes a saved rule, returning future payments to the 100%-owner fallback.
    function disableFlow(address owner, uint256 nonce, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        if (owner == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert SignatureExpired();

        uint256 expectedNonce = configurationNonces[owner];
        if (nonce != expectedNonce) revert InvalidConfigurationNonce(expectedNonce, nonce);
        if (_recover(disableDigest(owner, nonce, deadline), v, r, s) != owner) revert InvalidSignature();

        configurationNonces[owner] = expectedNonce + 1;
        delete rules[owner];

        emit FlowDisabled(owner, nonce);
    }

    /// @notice Prefixes 96 random bits with the recipient, binding an EIP-3009 payment to a Flow owner.
    function authorizationNonceFor(address owner, bytes12 salt) public pure returns (bytes32) {
        if (owner == address(0)) revert ZeroAddress();
        return bytes32(bytes20(owner)) | bytes32(uint256(uint96(salt)));
    }

    function executeFlow(
        address owner,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 authNonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (owner == address(0) || from == address(0)) revert ZeroAddress();
        if (value == 0) revert ZeroValue();
        if (address(uint160(uint256(authNonce) >> 96)) != owner) revert AuthorizationOwnerMismatch();

        ausd.receiveWithAuthorization(
            from, address(this), value, validAfter, validBefore, authNonce, abi.encodePacked(r, s, v)
        );

        Rule storage rule = rules[owner];
        uint256 count = rule.destinations.length;
        if (count == 0) {
            _transfer(owner, value);
            emit FlowDistribution(owner, authNonce, owner, value, 0);
        } else {
            uint256 distributed;
            for (uint256 i; i < count; ++i) {
                uint256 amount = i + 1 == count ? value - distributed : value * rule.basisPoints[i] / TOTAL_BASIS_POINTS;
                distributed += amount;
                if (amount != 0) _transfer(rule.destinations[i], amount);
                emit FlowDistribution(owner, authNonce, rule.destinations[i], amount, i);
            }
        }

        emit FlowExecuted(owner, from, value, authNonce, count);
    }

    function _validateRule(address owner, address[] calldata destinations, uint256[] calldata basisPoints)
        private
        pure
    {
        if (owner == address(0)) revert ZeroAddress();
        uint256 count = destinations.length;
        if (count == 0 || count > MAX_DESTINATIONS) revert InvalidDestinationCount();
        if (count != basisPoints.length) revert ArrayLengthMismatch();

        uint256 total;
        for (uint256 i; i < count; ++i) {
            if (destinations[i] == address(0)) revert ZeroAddress();
            if (basisPoints[i] == 0) revert ZeroBasisPoints();
            total += basisPoints[i];
            for (uint256 j; j < i; ++j) {
                if (destinations[j] == destinations[i]) revert DuplicateDestination();
            }
        }
        if (total != TOTAL_BASIS_POINTS) revert InvalidBasisPointTotal();
    }

    function _recover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) private pure returns (address signer) {
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > SECP256K1N_DIV_2) revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }

    function _transfer(address to, uint256 amount) private {
        if (!ausd.transfer(to, amount)) revert TransferFailed();
    }
}
