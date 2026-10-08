// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IDropAUSD {
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

/// @title FerryDrop
/// @notice Holds a bearer-link payment until the link holder signs its claim with a Ferry account.
contract FerryDrop {
    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(bytes32 claimHash,address recipient,uint256 deadline)");
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("FerryDrop");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_DIV_2 = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    IDropAUSD public immutable ausd;

    struct Drop {
        address sender;
        uint128 amount;
        uint64 expiresAt;
        uint8 status;
    }

    mapping(bytes32 claimHash => Drop drop) public drops;

    event DropCreated(bytes32 indexed claimHash, address indexed sender, uint256 amount, uint256 expiresAt);
    event DropClaimed(bytes32 indexed claimHash, address indexed recipient, uint256 amount);
    event DropRefunded(bytes32 indexed claimHash, address indexed sender, uint256 amount);

    error ZeroAddress();
    error ZeroValue();
    error InvalidExpiry();
    error DropExists();
    error DropUnavailable();
    error DropExpired();
    error DropNotExpired();
    error SignatureExpired();
    error InvalidSignature();
    error TransferFailed();

    constructor(address ausd_) {
        if (ausd_ == address(0)) revert ZeroAddress();
        ausd = IDropAUSD(ausd_);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function claimDigest(bytes32 claimHash, address recipient, uint256 deadline) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, claimHash, recipient, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function createDrop(
        bytes32 claimHash,
        address sender,
        uint256 amount,
        uint64 expiresAt,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 authorizationNonce,
        bytes calldata authorizationSignature
    ) external {
        if (claimHash == bytes32(0) || sender == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > type(uint128).max) revert ZeroValue();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + 30 days) revert InvalidExpiry();
        if (drops[claimHash].sender != address(0)) revert DropExists();

        ausd.receiveWithAuthorization(
            sender, address(this), amount, validAfter, validBefore, authorizationNonce, authorizationSignature
        );
        drops[claimHash] = Drop(sender, uint128(amount), expiresAt, 1);
        emit DropCreated(claimHash, sender, amount, expiresAt);
    }

    function claim(bytes32 secret, address recipient, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        if (recipient == address(0)) revert ZeroAddress();
        bytes32 claimHash = keccak256(abi.encodePacked(secret));
        Drop storage drop = drops[claimHash];
        if (drop.status != 1) revert DropUnavailable();
        if (block.timestamp > drop.expiresAt) revert DropExpired();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (_recover(claimDigest(claimHash, recipient, deadline), v, r, s) != recipient) {
            revert InvalidSignature();
        }

        drop.status = 2;
        if (!ausd.transfer(recipient, drop.amount)) revert TransferFailed();
        emit DropClaimed(claimHash, recipient, drop.amount);
    }

    function refund(bytes32 claimHash) external {
        Drop storage drop = drops[claimHash];
        if (drop.status != 1) revert DropUnavailable();
        if (block.timestamp <= drop.expiresAt) revert DropNotExpired();
        drop.status = 3;
        if (!ausd.transfer(drop.sender, drop.amount)) revert TransferFailed();
        emit DropRefunded(claimHash, drop.sender, drop.amount);
    }

    function _recover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) private pure returns (address signer) {
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > SECP256K1N_DIV_2) revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
