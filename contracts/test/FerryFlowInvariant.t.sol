// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {FerryFlow} from "../src/FerryFlow.sol";
import {MockAUSD} from "./FerryFlow.t.sol";

contract FerryFlowHandler is Test {
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    FerryFlow public immutable flow;
    MockAUSD public immutable token;
    uint256 public immutable ownerKey;
    uint256 public immutable payerKey;
    address public immutable owner;
    address public immutable payer;

    mapping(address destination => uint256 value) public expectedBalance;
    uint256 public totalExecuted;
    bool public replaySucceeded;

    address[5] private destinations;
    uint96 private executionSequence;

    constructor(FerryFlow flow_, MockAUSD token_, uint256 ownerKey_, uint256 payerKey_) {
        flow = flow_;
        token = token_;
        ownerKey = ownerKey_;
        payerKey = payerKey_;
        owner = vm.addr(ownerKey_);
        payer = vm.addr(payerKey_);
        destinations = [address(0x1001), address(0x1002), address(0x1003), address(0x1004), address(0x1005)];
    }

    function configure(uint8 rawVariant) external {
        (address[] memory selected, uint256[] memory bps) = _rule(rawVariant % 5);
        uint256 nonce = flow.configurationNonces(owner);
        uint256 deadline = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(ownerKey, flow.configurationDigest(owner, selected, bps, nonce, deadline));

        flow.configureFlow(owner, selected, bps, nonce, deadline, v, r, s);
        (bool replayed,) = address(flow)
            .call(abi.encodeCall(FerryFlow.configureFlow, (owner, selected, bps, nonce, deadline, v, r, s)));
        replaySucceeded = replaySucceeded || replayed;
    }

    function disable() external {
        uint256 nonce = flow.configurationNonces(owner);
        uint256 deadline = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, flow.disableDigest(owner, nonce, deadline));

        flow.disableFlow(owner, nonce, deadline, v, r, s);
        (bool replayed,) = address(flow).call(abi.encodeCall(FerryFlow.disableFlow, (owner, nonce, deadline, v, r, s)));
        replaySucceeded = replaySucceeded || replayed;
    }

    function execute(uint128 rawValue) external {
        uint256 value = bound(uint256(rawValue), 1, type(uint128).max);
        token.mint(payer, value);

        (address[] memory selected, uint256[] memory bps) = flow.getFlow(owner);
        bytes32 authorizationNonce = flow.authorizationNonceFor(owner, bytes12(++executionSequence));
        uint256 validAfter;
        uint256 validBefore = block.timestamp + 300;
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_TYPEHASH, payer, address(flow), value, validAfter, validBefore, authorizationNonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);

        flow.executeFlow(owner, payer, value, validAfter, validBefore, authorizationNonce, v, r, s);
        _recordDistribution(selected, bps, value);
        totalExecuted += value;

        (bool replayed,) = address(flow)
            .call(
                abi.encodeCall(
                    FerryFlow.executeFlow, (owner, payer, value, validAfter, validBefore, authorizationNonce, v, r, s)
                )
            );
        replaySucceeded = replaySucceeded || replayed;
    }

    function destination(uint256 index) external view returns (address) {
        return destinations[index];
    }

    function _recordDistribution(address[] memory selected, uint256[] memory bps, uint256 value) private {
        if (selected.length == 0) {
            expectedBalance[owner] += value;
            return;
        }

        uint256 distributed;
        for (uint256 i; i < selected.length; ++i) {
            uint256 amount = i + 1 == selected.length ? value - distributed : value * bps[i] / 10_000;
            distributed += amount;
            expectedBalance[selected[i]] += amount;
        }
    }

    function _rule(uint8 variant) private view returns (address[] memory selected, uint256[] memory bps) {
        uint256 count = uint256(variant) + 1;
        selected = new address[](count);
        bps = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            selected[i] = destinations[i];
        }

        if (count == 1) {
            bps[0] = 10_000;
        } else if (count == 2) {
            bps[0] = 6_000;
            bps[1] = 4_000;
        } else if (count == 3) {
            bps[0] = 5_000;
            bps[1] = 3_000;
            bps[2] = 2_000;
        } else if (count == 4) {
            bps[0] = 4_000;
            bps[1] = 3_000;
            bps[2] = 2_000;
            bps[3] = 1_000;
        } else {
            bps[0] = 3_000;
            bps[1] = 2_500;
            bps[2] = 2_000;
            bps[3] = 1_500;
            bps[4] = 1_000;
        }
    }
}

contract FerryFlowInvariantTest is StdInvariant, Test {
    uint256 private constant OWNER_KEY = 0xA11CE;
    uint256 private constant PAYER_KEY = 0xB0B;

    MockAUSD private token;
    FerryFlow private flow;
    FerryFlowHandler private handler;

    function setUp() public {
        vm.warp(1_000_000);
        token = new MockAUSD();
        flow = new FerryFlow(address(token));
        handler = new FerryFlowHandler(flow, token, OWNER_KEY, PAYER_KEY);

        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = FerryFlowHandler.configure.selector;
        selectors[1] = FerryFlowHandler.disable.selector;
        selectors[2] = FerryFlowHandler.execute.selector;
        excludeContract(address(token));
        excludeContract(address(flow));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_everySuccessfulExecutionIsFullyAllocated() public view {
        uint256 accounted = token.balanceOf(handler.owner());
        assertEq(accounted, handler.expectedBalance(handler.owner()));
        for (uint256 i; i < 5; ++i) {
            address destination = handler.destination(i);
            uint256 balance = token.balanceOf(destination);
            assertEq(balance, handler.expectedBalance(destination));
            accounted += balance;
        }

        assertEq(accounted, handler.totalExecuted());
        assertEq(token.balanceOf(address(flow)), 0);
        assertEq(token.balanceOf(handler.payer()), 0);
    }

    function invariant_replaysNeverSucceed() public view {
        assertFalse(handler.replaySucceeded());
    }
}
