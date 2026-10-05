// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {FerryFlow} from "../src/FerryFlow.sol";

contract MockAUSD {
    string public constant name = "Agora Dollar";
    string public constant version = "1";

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address authorizer => mapping(bytes32 nonce => bool used)) public authorizationState;

    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationUsed();
    error InvalidAuthorization();
    error InsufficientBalance();

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external virtual {
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationUsed();

        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        (bytes32 r, bytes32 s, uint8 v) = _split(signature);
        if (ecrecover(digest, v, r, s) != from) revert InvalidAuthorization();
        if (balanceOf[from] < value) revert InsufficientBalance();

        authorizationState[from][nonce] = true;
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }

    function transfer(address to, uint256 value) external virtual returns (bool) {
        if (balanceOf[msg.sender] < value) revert InsufficientBalance();
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this))
        );
    }

    function _split(bytes calldata signature) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (signature.length != 65) revert InvalidAuthorization();
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
    }
}

contract FalseTransferAUSD is MockAUSD {
    function transfer(address, uint256) external pure override returns (bool) {
        return false;
    }
}

contract RevertingTransferAUSD is MockAUSD {
    error MaliciousTransfer();

    function transfer(address, uint256) external pure override returns (bool) {
        revert MaliciousTransfer();
    }
}

contract RevertingReceiveAUSD is MockAUSD {
    error MaliciousReceive();

    function receiveWithAuthorization(address, address, uint256, uint256, uint256, bytes32, bytes calldata)
        external
        pure
        override
    {
        revert MaliciousReceive();
    }
}

contract FerryFlowTest is Test {
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    uint256 private constant OWNER_KEY = 0xA11CE;
    uint256 private constant PAYER_KEY = 0xB0B;
    uint256 private constant ATTACKER_KEY = 0xBAD;

    MockAUSD private ausd;
    FerryFlow private flow;
    address private owner;
    address private payer;
    address private destinationA = address(0xA);
    address private destinationB = address(0xB);
    address private destinationC = address(0xC);

    function setUp() public {
        owner = vm.addr(OWNER_KEY);
        payer = vm.addr(PAYER_KEY);
        ausd = new MockAUSD();
        flow = new FerryFlow(address(ausd));
        ausd.mint(payer, 1_000_000e6);
        vm.warp(1_000_000);
    }

    function test_configuresThroughRelayerAndExecutesSplit() public {
        (address[] memory destinations, uint256[] memory bps) = _twoWayRule();
        uint256 deadline = block.timestamp + 300;
        (uint8 cv, bytes32 cr, bytes32 cs) = _signConfiguration(OWNER_KEY, owner, destinations, bps, 0, deadline);

        vm.prank(address(0xBEEF));
        flow.configureFlow(owner, destinations, bps, 0, deadline, cv, cr, cs);

        assertEq(flow.configurationNonces(owner), 1);
        assertTrue(flow.hasFlow(owner));
        (address[] memory savedDestinations, uint256[] memory savedBps) = flow.getFlow(owner);
        assertEq(savedDestinations, destinations);
        assertEq(savedBps, bps);

        uint256 value = 100e6;
        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) =
            _authorization(owner, value, bytes12("payment-001"));

        vm.prank(address(0xCAFE));
        vm.expectEmit(true, true, true, true, address(flow));
        emit FerryFlow.FlowDistribution(owner, authNonce, destinationA, 60e6, 0);
        vm.expectEmit(true, true, true, true, address(flow));
        emit FerryFlow.FlowDistribution(owner, authNonce, destinationB, 40e6, 1);
        flow.executeFlow(owner, payer, value, validAfter, validBefore, authNonce, v, r, s);

        assertEq(ausd.balanceOf(destinationA), 60e6);
        assertEq(ausd.balanceOf(destinationB), 40e6);
        assertEq(ausd.balanceOf(address(flow)), 0);
        assertEq(ausd.balanceOf(payer), 1_000_000e6 - value);
    }

    function test_configurationDigestMatchesDeclaredEip712FieldOrder() public view {
        (address[] memory destinations, uint256[] memory bps) = _twoWayRule();
        uint256 deadline = block.timestamp + 300;
        bytes32 structHash = keccak256(
            abi.encode(
                flow.CONFIGURE_FLOW_TYPEHASH(),
                owner,
                keccak256(abi.encodePacked(destinations)),
                keccak256(abi.encodePacked(bps)),
                uint256(0),
                deadline
            )
        );
        bytes32 expected = keccak256(abi.encodePacked("\x19\x01", flow.domainSeparator(), structHash));

        assertEq(flow.configurationDigest(owner, destinations, bps, 0, deadline), expected);
    }

    function test_eventTopicsRemainCompatibleWithApiIndexer() public pure {
        assertEq(
            keccak256("FlowConfigured(address,uint256,address[],uint256[])"),
            0x7064538e0a28251a5bfa704384d1a498d518268c2ad0eb194d697d9106f8aaa3
        );
        assertEq(
            keccak256("FlowDisabled(address,uint256)"),
            0xec7c9920943bbc0487c333dc4df45b2d5b45b93040aa7202d2ea3be36b4f63eb
        );
        assertEq(
            keccak256("FlowExecuted(address,address,uint256,bytes32,uint256)"),
            0xb03b686ce9ac7499f805f4e62f7b949b4ffc9937159afd1e50d3bbbef07e3260
        );
        assertEq(
            keccak256("FlowDistribution(address,bytes32,address,uint256,uint256)"),
            0xc736384090580e2a7cb92e71f0bd7f6d713c962d669b1dfa5869579465efb1a6
        );
    }

    function test_sendsAllToOwnerWhenNoRuleExists() public {
        uint256 value = 75e6;
        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) =
            _authorization(owner, value, bytes12("fallback-001"));

        flow.executeFlow(owner, payer, value, validAfter, validBefore, authNonce, v, r, s);

        assertEq(ausd.balanceOf(owner), value);
        assertEq(ausd.balanceOf(address(flow)), 0);
    }

    function test_signedDisableReturnsToOwnerFallbackAndConsumesNonce() public {
        (address[] memory destinations, uint256[] memory bps) = _twoWayRule();
        _configure(destinations, bps);

        uint256 nonce = flow.configurationNonces(owner);
        uint256 deadline = block.timestamp + 300;
        bytes32 digest = flow.disableDigest(owner, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);
        vm.prank(address(0xBEEF));
        flow.disableFlow(owner, nonce, deadline, v, r, s);

        assertFalse(flow.hasFlow(owner));
        assertEq(flow.configurationNonces(owner), nonce + 1);

        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 av, bytes32 ar, bytes32 as_) =
            _authorization(owner, 25e6, bytes12("disabled-001"));
        flow.executeFlow(owner, payer, 25e6, validAfter, validBefore, authNonce, av, ar, as_);
        assertEq(ausd.balanceOf(owner), 25e6);
    }

    function test_rejectsReplayedExpiredOrTamperedDisableSignature() public {
        uint256 deadline = block.timestamp + 300;
        bytes32 digest = flow.disableDigest(owner, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);
        flow.disableFlow(owner, 0, deadline, v, r, s);

        vm.expectRevert(abi.encodeWithSelector(FerryFlow.InvalidConfigurationNonce.selector, 1, 0));
        flow.disableFlow(owner, 0, deadline, v, r, s);

        digest = flow.disableDigest(owner, 1, deadline);
        (v, r, s) = vm.sign(ATTACKER_KEY, digest);
        vm.expectRevert(FerryFlow.InvalidSignature.selector);
        flow.disableFlow(owner, 1, deadline, v, r, s);

        deadline = block.timestamp - 1;
        digest = flow.disableDigest(owner, 1, deadline);
        (v, r, s) = vm.sign(OWNER_KEY, digest);
        vm.expectRevert(FerryFlow.SignatureExpired.selector);
        flow.disableFlow(owner, 1, deadline, v, r, s);
    }

    function test_sendsRoundingDustToLastDestination() public {
        address[] memory destinations = new address[](3);
        destinations[0] = destinationA;
        destinations[1] = destinationB;
        destinations[2] = destinationC;
        uint256[] memory bps = new uint256[](3);
        bps[0] = 3333;
        bps[1] = 3333;
        bps[2] = 3334;
        _configure(destinations, bps);

        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) =
            _authorization(owner, 101, bytes12("rounding-001"));
        flow.executeFlow(owner, payer, 101, validAfter, validBefore, authNonce, v, r, s);

        assertEq(ausd.balanceOf(destinationA), 33);
        assertEq(ausd.balanceOf(destinationB), 33);
        assertEq(ausd.balanceOf(destinationC), 35);
    }

    function test_rejectsReplayedAndNonSequentialConfigurationNonces() public {
        (address[] memory destinations, uint256[] memory bps) = _twoWayRule();
        uint256 deadline = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _signConfiguration(OWNER_KEY, owner, destinations, bps, 0, deadline);
        flow.configureFlow(owner, destinations, bps, 0, deadline, v, r, s);

        vm.expectRevert(abi.encodeWithSelector(FerryFlow.InvalidConfigurationNonce.selector, 1, 0));
        flow.configureFlow(owner, destinations, bps, 0, deadline, v, r, s);

        (v, r, s) = _signConfiguration(OWNER_KEY, owner, destinations, bps, 2, deadline);
        vm.expectRevert(abi.encodeWithSelector(FerryFlow.InvalidConfigurationNonce.selector, 1, 2));
        flow.configureFlow(owner, destinations, bps, 2, deadline, v, r, s);
    }

    function test_rejectsExpiredConfigurationSignature() public {
        (address[] memory destinations, uint256[] memory bps) = _twoWayRule();
        uint256 deadline = block.timestamp - 1;
        (uint8 v, bytes32 r, bytes32 s) = _signConfiguration(OWNER_KEY, owner, destinations, bps, 0, deadline);

        vm.expectRevert(FerryFlow.SignatureExpired.selector);
        flow.configureFlow(owner, destinations, bps, 0, deadline, v, r, s);
    }

    function test_rejectsTamperedConfigurationAndWrongSigner() public {
        (address[] memory destinations, uint256[] memory bps) = _twoWayRule();
        uint256 deadline = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _signConfiguration(OWNER_KEY, owner, destinations, bps, 0, deadline);

        bps[0] = 5000;
        bps[1] = 5000;
        vm.expectRevert(FerryFlow.InvalidSignature.selector);
        flow.configureFlow(owner, destinations, bps, 0, deadline, v, r, s);

        (v, r, s) = _signConfiguration(ATTACKER_KEY, owner, destinations, bps, 0, deadline);
        vm.expectRevert(FerryFlow.InvalidSignature.selector);
        flow.configureFlow(owner, destinations, bps, 0, deadline, v, r, s);
    }

    function test_rejectsInvalidRules() public {
        address[] memory destinations = new address[](0);
        uint256[] memory bps = new uint256[](0);
        _expectRuleError(address(0), destinations, bps, FerryFlow.ZeroAddress.selector);
        _expectRuleError(owner, destinations, bps, FerryFlow.InvalidDestinationCount.selector);

        destinations = new address[](6);
        bps = new uint256[](6);
        for (uint256 i; i < 6; ++i) {
            destinations[i] = address(uint160(100 + i));
            bps[i] = i == 5 ? 1_665 : 1_667;
        }
        _expectRuleError(owner, destinations, bps, FerryFlow.InvalidDestinationCount.selector);

        destinations = new address[](2);
        destinations[0] = destinationA;
        destinations[1] = destinationB;
        bps = new uint256[](1);
        bps[0] = 10_000;
        _expectRuleError(owner, destinations, bps, FerryFlow.ArrayLengthMismatch.selector);

        bps = new uint256[](2);
        bps[0] = 6_000;
        bps[1] = 3_999;
        _expectRuleError(owner, destinations, bps, FerryFlow.InvalidBasisPointTotal.selector);

        bps[0] = 10_000;
        bps[1] = 0;
        _expectRuleError(owner, destinations, bps, FerryFlow.ZeroBasisPoints.selector);

        bps[0] = 5_000;
        bps[1] = 5_000;
        destinations[1] = address(0);
        _expectRuleError(owner, destinations, bps, FerryFlow.ZeroAddress.selector);

        destinations[1] = destinationA;
        _expectRuleError(owner, destinations, bps, FerryFlow.DuplicateDestination.selector);
    }

    function test_authorizationCannotBeReplayed() public {
        uint256 value = 10e6;
        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) =
            _authorization(owner, value, bytes12("replay-00001"));
        flow.executeFlow(owner, payer, value, validAfter, validBefore, authNonce, v, r, s);

        vm.expectRevert(MockAUSD.AuthorizationUsed.selector);
        flow.executeFlow(owner, payer, value, validAfter, validBefore, authNonce, v, r, s);
    }

    function test_rejectsExpiredOrTamperedAuthorization() public {
        uint256 value = 10e6;
        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) =
            _authorization(owner, value, bytes12("expiry-00001"));

        vm.warp(validBefore);
        vm.expectRevert(MockAUSD.AuthorizationExpired.selector);
        flow.executeFlow(owner, payer, value, validAfter, validBefore, authNonce, v, r, s);

        vm.warp(validBefore - 1);
        vm.expectRevert(MockAUSD.InvalidAuthorization.selector);
        flow.executeFlow(owner, payer, value + 1, validAfter, validBefore, authNonce, v, r, s);
    }

    function test_relayerCannotSubstituteFlowOwner() public {
        address attackerOwner = vm.addr(ATTACKER_KEY);
        uint256 value = 50e6;
        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) =
            _authorization(owner, value, bytes12("bound-000001"));

        vm.expectRevert(FerryFlow.AuthorizationOwnerMismatch.selector);
        flow.executeFlow(attackerOwner, payer, value, validAfter, validBefore, authNonce, v, r, s);
    }

    function test_revertsAtomicallyWhenDistributionFails() public {
        FalseTransferAUSD falseToken = new FalseTransferAUSD();
        FerryFlow failingFlow = new FerryFlow(address(falseToken));
        falseToken.mint(payer, 100e6);

        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 300;
        bytes32 nonce = failingFlow.authorizationNonceFor(owner, bytes12("failure-0001"));
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, payer, address(failingFlow), 100e6, validAfter, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", falseToken.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PAYER_KEY, digest);

        vm.expectRevert(FerryFlow.TransferFailed.selector);
        failingFlow.executeFlow(owner, payer, 100e6, validAfter, validBefore, nonce, v, r, s);
        assertEq(falseToken.balanceOf(payer), 100e6);
        assertFalse(falseToken.authorizationState(payer, nonce));
    }

    function test_revertsAtomicallyWhenTokenTransferReverts() public {
        RevertingTransferAUSD revertingToken = new RevertingTransferAUSD();
        FerryFlow failingFlow = new FerryFlow(address(revertingToken));
        revertingToken.mint(payer, 100e6);

        (uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) =
            _authorizationFor(revertingToken, failingFlow, owner, 100e6, bytes12("failure-0002"));

        vm.expectRevert(RevertingTransferAUSD.MaliciousTransfer.selector);
        failingFlow.executeFlow(owner, payer, 100e6, validAfter, validBefore, nonce, v, r, s);
        assertEq(revertingToken.balanceOf(payer), 100e6);
        assertEq(revertingToken.balanceOf(address(failingFlow)), 0);
        assertFalse(revertingToken.authorizationState(payer, nonce));
    }

    function test_revertsCleanlyWhenTokenPullFails() public {
        RevertingReceiveAUSD revertingToken = new RevertingReceiveAUSD();
        FerryFlow failingFlow = new FerryFlow(address(revertingToken));
        revertingToken.mint(payer, 100e6);

        bytes32 nonce = failingFlow.authorizationNonceFor(owner, bytes12("failure-0003"));
        vm.expectRevert(RevertingReceiveAUSD.MaliciousReceive.selector);
        failingFlow.executeFlow(owner, payer, 100e6, 0, block.timestamp + 300, nonce, 27, bytes32(0), bytes32(0));

        assertEq(revertingToken.balanceOf(payer), 100e6);
        assertEq(revertingToken.balanceOf(address(failingFlow)), 0);
        assertFalse(revertingToken.authorizationState(payer, nonce));
    }

    function test_oldConfigurationSignatureCannotBeReplayedAfterDisable() public {
        (address[] memory destinations, uint256[] memory bps) = _twoWayRule();
        uint256 deadline = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _signConfiguration(OWNER_KEY, owner, destinations, bps, 0, deadline);
        flow.configureFlow(owner, destinations, bps, 0, deadline, v, r, s);

        bytes32 digest = flow.disableDigest(owner, 1, deadline);
        (uint8 dv, bytes32 dr, bytes32 ds) = vm.sign(OWNER_KEY, digest);
        flow.disableFlow(owner, 1, deadline, dv, dr, ds);

        vm.expectRevert(abi.encodeWithSelector(FerryFlow.InvalidConfigurationNonce.selector, 2, 0));
        flow.configureFlow(owner, destinations, bps, 0, deadline, v, r, s);
        assertFalse(flow.hasFlow(owner));
    }

    function testFuzz_allocationConservesValueAndAssignsDustToLast(
        uint128 rawValue,
        uint16 rawA,
        uint16 rawB,
        uint16 rawC,
        uint16 rawD
    ) public {
        uint256 value = bound(uint256(rawValue), 1, type(uint128).max);
        (address[] memory destinations, uint256[] memory bps) = _fiveWayRule(rawA, rawB, rawC, rawD);
        _configure(destinations, bps);
        ausd.mint(payer, value);

        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) =
            _authorization(owner, value, bytes12("fuzz-alloc01"));
        flow.executeFlow(owner, payer, value, validAfter, validBefore, authNonce, v, r, s);

        uint256 distributed;
        for (uint256 i; i < destinations.length; ++i) {
            uint256 amount = ausd.balanceOf(destinations[i]);
            distributed += amount;
            if (i + 1 == destinations.length) {
                uint256 floors;
                for (uint256 j; j + 1 < destinations.length; ++j) {
                    floors += value * bps[j] / flow.TOTAL_BASIS_POINTS();
                }
                assertEq(amount, value - floors);
            } else {
                assertEq(amount, value * bps[i] / flow.TOTAL_BASIS_POINTS());
            }
        }

        assertEq(distributed, value);
        assertEq(ausd.balanceOf(address(flow)), 0);
    }

    function testFuzz_disabledFlowAlwaysFallsBackToOwner(uint128 rawValue) public {
        (address[] memory destinations, uint256[] memory bps) = _twoWayRule();
        _configure(destinations, bps);

        uint256 nonce = flow.configurationNonces(owner);
        uint256 deadline = block.timestamp + 300;
        (uint8 dv, bytes32 dr, bytes32 ds) = vm.sign(OWNER_KEY, flow.disableDigest(owner, nonce, deadline));
        flow.disableFlow(owner, nonce, deadline, dv, dr, ds);

        uint256 value = bound(uint256(rawValue), 1, type(uint128).max);
        ausd.mint(payer, value);
        (uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) =
            _authorization(owner, value, bytes12("fuzz-fall001"));
        flow.executeFlow(owner, payer, value, validAfter, validBefore, authNonce, v, r, s);

        assertEq(ausd.balanceOf(owner), value);
        assertEq(ausd.balanceOf(address(flow)), 0);
        assertFalse(flow.hasFlow(owner));
    }

    function _configure(address[] memory destinations, uint256[] memory bps) private {
        uint256 nonce = flow.configurationNonces(owner);
        uint256 deadline = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _signConfiguration(OWNER_KEY, owner, destinations, bps, nonce, deadline);
        flow.configureFlow(owner, destinations, bps, nonce, deadline, v, r, s);
    }

    function _expectRuleError(
        address ruleOwner,
        address[] memory destinations,
        uint256[] memory bps,
        bytes4 errorSelector
    ) private {
        vm.expectRevert(errorSelector);
        flow.configureFlow(ruleOwner, destinations, bps, 0, block.timestamp + 300, 27, bytes32(0), bytes32(uint256(1)));
    }

    function _twoWayRule() private view returns (address[] memory destinations, uint256[] memory bps) {
        destinations = new address[](2);
        destinations[0] = destinationA;
        destinations[1] = destinationB;
        bps = new uint256[](2);
        bps[0] = 6000;
        bps[1] = 4000;
    }

    function _signConfiguration(
        uint256 signerKey,
        address ruleOwner,
        address[] memory destinations,
        uint256[] memory bps,
        uint256 nonce,
        uint256 deadline
    ) private view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 digest = flow.configurationDigest(ruleOwner, destinations, bps, nonce, deadline);
        return vm.sign(signerKey, digest);
    }

    function _authorization(address ruleOwner, uint256 value, bytes12 salt)
        private
        view
        returns (uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
    {
        validAfter = 0;
        validBefore = block.timestamp + 300;
        nonce = flow.authorizationNonceFor(ruleOwner, salt);
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, payer, address(flow), value, validAfter, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ausd.domainSeparator(), structHash));
        (v, r, s) = vm.sign(PAYER_KEY, digest);
    }

    function _authorizationFor(MockAUSD token, FerryFlow targetFlow, address ruleOwner, uint256 value, bytes12 salt)
        private
        view
        returns (uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
    {
        validAfter = 0;
        validBefore = block.timestamp + 300;
        nonce = targetFlow.authorizationNonceFor(ruleOwner, salt);
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, payer, address(targetFlow), value, validAfter, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.domainSeparator(), structHash));
        (v, r, s) = vm.sign(PAYER_KEY, digest);
    }

    function _fiveWayRule(uint16 rawA, uint16 rawB, uint16 rawC, uint16 rawD)
        private
        pure
        returns (address[] memory destinations, uint256[] memory bps)
    {
        destinations = new address[](5);
        destinations[0] = address(0xA);
        destinations[1] = address(0xB);
        destinations[2] = address(0xC);
        destinations[3] = address(0xD);
        destinations[4] = address(0xE);

        bps = new uint256[](5);
        bps[0] = bound(uint256(rawA), 1, 9_996);
        bps[1] = bound(uint256(rawB), 1, 9_997 - bps[0]);
        bps[2] = bound(uint256(rawC), 1, 9_998 - bps[0] - bps[1]);
        bps[3] = bound(uint256(rawD), 1, 9_999 - bps[0] - bps[1] - bps[2]);
        bps[4] = 10_000 - bps[0] - bps[1] - bps[2] - bps[3];
    }
}
