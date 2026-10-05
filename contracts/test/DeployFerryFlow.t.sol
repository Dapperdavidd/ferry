// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {FerryFlow} from "../src/FerryFlow.sol";
import {DeployFerryFlow} from "../script/DeployFerryFlow.s.sol";

contract DeployFerryFlowTest is Test {
    function setUp() public {
        vm.createSelectFork("monad_testnet");
    }

    function test_deploysAtPredictedAddressWithExpectedDependency() public {
        DeployFerryFlow script = new DeployFerryFlow();
        address predicted = script.predictedAddress();

        FerryFlow flow = script.run();

        assertEq(address(flow), predicted);
        assertGt(predicted.code.length, 0);
        assertEq(address(flow.ausd()), script.AUSD());
    }

    function test_isIdempotentOnTheSameChainState() public {
        DeployFerryFlow script = new DeployFerryFlow();

        FerryFlow first = script.run();
        FerryFlow second = script.run();

        assertEq(address(first), address(second));
    }
}
