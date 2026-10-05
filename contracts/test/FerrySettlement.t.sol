// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {FerrySettlement} from "../src/FerrySettlement.sol";

interface IERC20View {
    function balanceOf(address) external view returns (uint256);
}

interface IFaucet {
    function requestFunds(address recipient) external;
}

interface IWhitelister {
    function setApprovedSwapper(address account) external;
}

interface IPairView {
    function hasRole(string calldata role, address account) external view returns (bool);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
}

interface IEip712 {
    function eip712Domain()
        external
        view
        returns (
            bytes1,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32,
            uint256[] memory
        );
}

/// Runs against a fork of Monad testnet, where AUSD, its faucet and Agora's CTK/AUSD pool are live.
contract FerrySettlementTest is Test {
    address constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    address constant FAUCET = 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C;
    address constant CTK = 0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D;
    address constant PAIR = 0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae;
    address constant WHITELISTER = 0x7c10F56d6f04a51376393a1C3670e966863F6BD5;

    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    FerrySettlement settlement;
    uint256 userKey = 0x83cea2443a7c429300cb5ea4f988216d36574d68dc0f892cba7c8dcaa6f743be;
    address user;
    address relayer = address(0xBEEF);
    address payoutTo = address(0xCAFE);
    bytes32 domainSeparator;

    function setUp() public {
        vm.createSelectFork("monad_testnet");
        user = vm.addr(userKey);
        settlement = new FerrySettlement(AUSD, PAIR, CTK);
        IWhitelister(WHITELISTER).setApprovedSwapper(address(settlement));
        assertTrue(IPairView(PAIR).hasRole("APPROVED_SWAPPER", address(settlement)), "whitelisted");

        vm.deal(relayer, 1 ether);
        vm.prank(relayer);
        IFaucet(FAUCET).requestFunds(user);
        assertEq(IERC20View(AUSD).balanceOf(user), 10_000e6, "faucet paid");

        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            IEip712(AUSD).eip712Domain();
        domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifyingContract
            )
        );
    }

    function sign(uint256 value, uint256 validBefore, bytes32 nonce) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, user, address(settlement), value, uint256(0), validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_settlesInOneTransaction() public {
        uint256 value = 100e6;
        address[] memory path = new address[](2);
        path[0] = AUSD;
        path[1] = CTK;
        uint256 quoted = IPairView(PAIR).getAmountsOut(value, path)[1];
        uint256 minOut = quoted * 99 / 100;
        bytes32 salt = keccak256("salt-1");
        bytes32 nonce = settlement.nonceFor(payoutTo, minOut, salt);
        uint256 validBefore = block.timestamp + 300;
        bytes memory signature = sign(value, validBefore, nonce);

        vm.prank(relayer);
        vm.expectEmit(true, true, false, false, address(settlement));
        emit FerrySettlement.Settled(user, payoutTo, value, 0, nonce);
        uint256 amountOut = settlement.settle(
            user, value, 0, validBefore, nonce, signature, payoutTo, minOut, salt, block.timestamp + 300
        );

        assertGe(amountOut, minOut, "at least the minimum");
        assertEq(IERC20View(CTK).balanceOf(payoutTo), amountOut, "payout received the output");
        assertEq(IERC20View(AUSD).balanceOf(user), 10_000e6 - value, "user paid exactly the value");
        assertEq(IERC20View(AUSD).balanceOf(address(settlement)), 0, "contract keeps no AUSD");
        assertEq(IERC20View(CTK).balanceOf(address(settlement)), 0, "contract keeps no CTK");
    }

    function test_relayerCannotChangeTheTerms() public {
        uint256 value = 50e6;
        uint256 minOut = 49e18;
        bytes32 salt = keccak256("salt-2");
        bytes32 nonce = settlement.nonceFor(payoutTo, minOut, salt);
        uint256 validBefore = block.timestamp + 300;
        bytes memory signature = sign(value, validBefore, nonce);

        vm.startPrank(relayer);
        vm.expectRevert(FerrySettlement.TermsMismatch.selector);
        settlement.settle(
            user, value, 0, validBefore, nonce, signature, address(0xBAD), minOut, salt, block.timestamp + 300
        );
        vm.expectRevert(FerrySettlement.TermsMismatch.selector);
        settlement.settle(user, value, 0, validBefore, nonce, signature, payoutTo, 1, salt, block.timestamp + 300);
        vm.stopPrank();
    }

    function test_authorizationCannotBeReplayed() public {
        uint256 value = 10e6;
        uint256 minOut = 9e18;
        bytes32 salt = keccak256("salt-3");
        bytes32 nonce = settlement.nonceFor(payoutTo, minOut, salt);
        uint256 validBefore = block.timestamp + 300;
        bytes memory signature = sign(value, validBefore, nonce);

        vm.startPrank(relayer);
        settlement.settle(user, value, 0, validBefore, nonce, signature, payoutTo, minOut, salt, block.timestamp + 300);
        vm.expectRevert();
        settlement.settle(user, value, 0, validBefore, nonce, signature, payoutTo, minOut, salt, block.timestamp + 300);
        vm.stopPrank();
    }

    function test_tooHighMinimumReverts() public {
        uint256 value = 10e6;
        uint256 minOut = 11e18;
        bytes32 salt = keccak256("salt-4");
        bytes32 nonce = settlement.nonceFor(payoutTo, minOut, salt);
        uint256 validBefore = block.timestamp + 300;
        bytes memory signature = sign(value, validBefore, nonce);

        vm.prank(relayer);
        vm.expectRevert();
        settlement.settle(user, value, 0, validBefore, nonce, signature, payoutTo, minOut, salt, block.timestamp + 300);
        assertEq(IERC20View(AUSD).balanceOf(user), 10_000e6, "nothing moved");
    }
}
