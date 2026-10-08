// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {FerryDrop, IDropAUSD} from "../src/FerryDrop.sol";

contract MockDropAUSD is IDropAUSD {
    mapping(address => uint256) public balanceOf;

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256,
        uint256,
        bytes32,
        bytes calldata
    ) external {
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }
}

contract FerryDropTest is Test {
    MockDropAUSD private token;
    FerryDrop private drop;
    uint256 private senderKey = 0xA11CE;
    uint256 private recipientKey = 0xB0B;
    address private sender;
    address private recipient;
    bytes32 private secret = keccak256("one-time-link-secret");
    bytes32 private claimHash;

    function setUp() external {
        sender = vm.addr(senderKey);
        recipient = vm.addr(recipientKey);
        token = new MockDropAUSD();
        drop = new FerryDrop(address(token));
        claimHash = keccak256(abi.encodePacked(secret));
        token.mint(sender, 100e6);
    }

    function testCreateAndClaimWithRecipientSignature() external {
        drop.createDrop(
            claimHash,
            sender,
            25e6,
            uint64(block.timestamp + 1 days),
            0,
            block.timestamp + 5 minutes,
            bytes32("n"),
            "sig"
        );
        uint256 deadline = block.timestamp + 5 minutes;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(recipientKey, drop.claimDigest(claimHash, recipient, deadline));
        drop.claim(secret, recipient, deadline, v, r, s);
        assertEq(token.balanceOf(recipient), 25e6);
        (,,, uint8 status) = drop.drops(claimHash);
        assertEq(status, 2);
    }

    function testCannotRedirectClaimWithAnotherSignature() external {
        drop.createDrop(
            claimHash,
            sender,
            25e6,
            uint64(block.timestamp + 1 days),
            0,
            block.timestamp + 5 minutes,
            bytes32("n"),
            "sig"
        );
        uint256 deadline = block.timestamp + 5 minutes;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(recipientKey, drop.claimDigest(claimHash, recipient, deadline));
        vm.expectRevert(FerryDrop.InvalidSignature.selector);
        drop.claim(secret, address(0xBAD), deadline, v, r, s);
    }

    function testRefundAfterExpiry() external {
        drop.createDrop(
            claimHash,
            sender,
            25e6,
            uint64(block.timestamp + 1 days),
            0,
            block.timestamp + 5 minutes,
            bytes32("n"),
            "sig"
        );
        vm.warp(block.timestamp + 1 days + 1);
        drop.refund(claimHash);
        assertEq(token.balanceOf(sender), 100e6);
        (,,, uint8 status) = drop.drops(claimHash);
        assertEq(status, 3);
    }
}
