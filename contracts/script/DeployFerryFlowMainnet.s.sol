// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {FerryFlow} from "../src/FerryFlow.sol";

/// @notice Deterministically deploys FerryFlow on Monad mainnet.
/// @dev The chain, AUSD dependency, deployer bytecode, and salt are pinned so a
///      production command cannot silently deploy the testnet configuration.
contract DeployFerryFlowMainnet is Script {
    uint256 public constant MONAD_MAINNET_CHAIN_ID = 143;
    address public constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address public constant DETERMINISTIC_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 public constant DETERMINISTIC_DEPLOYER_CODEHASH =
        0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989;
    bytes32 public constant FLOW_SALT = keccak256("ferry.money:FerryFlow:1:monad-mainnet");

    error UnsupportedChain(uint256 actualChainId);
    error MissingCode(address account);
    error UnexpectedCodeHash(address account, bytes32 expected, bytes32 actual);
    error DeploymentFailed(address expected);
    error UnexpectedDependency(address expected, address actual);

    function initCode() public pure returns (bytes memory) {
        return abi.encodePacked(type(FerryFlow).creationCode, abi.encode(AUSD));
    }

    function predictedAddress() public pure returns (address) {
        return _create2Address(FLOW_SALT, keccak256(initCode()), DETERMINISTIC_DEPLOYER);
    }

    function run() external returns (FerryFlow flow) {
        if (block.chainid != MONAD_MAINNET_CHAIN_ID) revert UnsupportedChain(block.chainid);
        if (AUSD.code.length == 0) revert MissingCode(AUSD);
        if (DETERMINISTIC_DEPLOYER.code.length == 0) revert MissingCode(DETERMINISTIC_DEPLOYER);
        if (DETERMINISTIC_DEPLOYER.codehash != DETERMINISTIC_DEPLOYER_CODEHASH) {
            revert UnexpectedCodeHash(
                DETERMINISTIC_DEPLOYER, DETERMINISTIC_DEPLOYER_CODEHASH, DETERMINISTIC_DEPLOYER.codehash
            );
        }

        address expected = predictedAddress();
        if (expected.code.length == 0) {
            vm.startBroadcast();
            (bool deployed,) = DETERMINISTIC_DEPLOYER.call(abi.encodePacked(FLOW_SALT, initCode()));
            vm.stopBroadcast();
            if (!deployed || expected.code.length == 0) revert DeploymentFailed(expected);
        }

        flow = FerryFlow(expected);
        address dependency = address(flow.ausd());
        if (dependency != AUSD) revert UnexpectedDependency(AUSD, dependency);

        console2.log("FerryFlow mainnet", expected);
        console2.log("AUSD mainnet", dependency);
    }

    function _create2Address(bytes32 salt, bytes32 initCodeHash, address deployer) private pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }
}
