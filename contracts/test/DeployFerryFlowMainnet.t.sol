// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {FerryFlow} from "../src/FerryFlow.sol";
import {DeployFerryFlowMainnet} from "../script/DeployFerryFlowMainnet.s.sol";

contract DeployFerryFlowMainnetTest is Test {
    function setUp() public {
        vm.createSelectFork("monad_mainnet");
    }

    function test_mainnetDependenciesAndPredictionArePinned() public {
        DeployFerryFlowMainnet script = new DeployFerryFlowMainnet();

        assertEq(block.chainid, script.MONAD_MAINNET_CHAIN_ID());
        assertGt(script.AUSD().code.length, 0);
        assertGt(script.DETERMINISTIC_DEPLOYER().code.length, 0);
        assertEq(script.DETERMINISTIC_DEPLOYER().codehash, script.DETERMINISTIC_DEPLOYER_CODEHASH());
        assertTrue(script.predictedAddress() != address(0));
    }

    function test_deploysAtPredictedAddressWithMainnetAusd() public {
        DeployFerryFlowMainnet script = new DeployFerryFlowMainnet();
        address predicted = script.predictedAddress();

        FerryFlow flow = script.run();

        assertEq(address(flow), predicted);
        assertGt(predicted.code.length, 0);
        assertEq(address(flow.ausd()), script.AUSD());
    }
}
