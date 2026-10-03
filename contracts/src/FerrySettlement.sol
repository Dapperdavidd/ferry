// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAUSD {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;

    function approve(address spender, uint256 amount) external returns (bool);
}

interface IStableSwapPair {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @title FerrySettlement
/// @notice Cashes AUSD out through Agora's Instant Settlement pool in one transaction.
/// The user signs one EIP-3009 ReceiveWithAuthorization naming this contract; its nonce is
/// keccak256(payoutTo, minOut, salt), so the relayer that pays gas cannot change where the
/// money goes or how little is acceptable. The contract never holds funds between calls and
/// has no owner.
contract FerrySettlement {
    IAUSD public immutable ausd;
    IStableSwapPair public immutable pair;
    address public immutable outToken;

    event Settled(address indexed from, address indexed payoutTo, uint256 amountIn, uint256 amountOut, bytes32 nonce);

    error TermsMismatch();
    error ApproveFailed();

    constructor(address ausd_, address pair_, address outToken_) {
        ausd = IAUSD(ausd_);
        pair = IStableSwapPair(pair_);
        outToken = outToken_;
    }

    /// @notice What the user signed must commit to the payout terms the relayer passes in.
    function nonceFor(address payoutTo, uint256 minOut, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(payoutTo, minOut, salt));
    }

    function settle(
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature,
        address payoutTo,
        uint256 minOut,
        bytes32 salt,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        if (nonce != nonceFor(payoutTo, minOut, salt)) revert TermsMismatch();

        // EIP-3009: the receiver must be msg.sender of this call into AUSD, which is this contract.
        ausd.receiveWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, signature);
        if (!ausd.approve(address(pair), value)) revert ApproveFailed();

        address[] memory path = new address[](2);
        path[0] = address(ausd);
        path[1] = outToken;
        uint256[] memory amounts = pair.swapExactTokensForTokens(value, minOut, path, payoutTo, deadline);
        amountOut = amounts[amounts.length - 1];

        emit Settled(from, payoutTo, value, amountOut, nonce);
    }
}
