// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title DAO Timelock Contract
/// @notice Implements delayed execution of governance decisions
contract Timelock is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Minimum delay for operations
    uint256 public minDelay;

    /// @notice Operation state
    /// @param executed Whether operation was executed
    /// @param canceled Whether operation was canceled
    /// @param timestamp When operation can be executed
    struct Operation {
        bool executed;
        bool canceled;
        uint256 timestamp;
    }

    /// @notice Mapping from operation hash to its state
    mapping(bytes32 => Operation) public operations;

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialMinDelay Initial minimum delay
    function initialize(
        address initialAddressBook,
        uint256 initialMinDelay
    ) external initializer {
        __UUPSUpgradeable_init();
        addressBook = AddressBook(initialAddressBook);
        minDelay = initialMinDelay;
    }

    /// @notice Schedules an operation
    /// @param target Target address for call
    /// @param value ETH value for call
    /// @param data Calldata for call
    /// @param delay Delay before execution (must be >= minDelay)
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 delay
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(delay >= minDelay, "Delay too short");

        bytes32 operationId = getOperationId(target, value, data, delay);
        require(operations[operationId].timestamp == 0, "Operation exists");

        uint256 timestamp = block.timestamp + delay;
        operations[operationId] = Operation({
            executed: false,
            canceled: false,
            timestamp: timestamp
        });

        addressBook.eventEmitter().emitTimelock_OperationScheduled(operationId, target, value, data, timestamp);
    }

    /// @notice Executes a scheduled operation
    /// @param target Target address for call
    /// @param value ETH value for call
    /// @param data Calldata for call
    /// @param delay Original delay used in scheduling
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 delay
    ) external payable {
        bytes32 operationId = getOperationId(target, value, data, delay);
        Operation storage op = operations[operationId];

        require(op.timestamp > 0, "Operation doesn't exist");
        require(!op.executed, "Operation already executed");
        require(!op.canceled, "Operation canceled");
        require(block.timestamp >= op.timestamp, "Operation not ready");

        op.executed = true;

        (bool success, ) = target.call{value: value}(data);
        require(success, "Operation execution failed");

        addressBook.eventEmitter().emitTimelock_OperationExecuted(operationId);
    }

    /// @notice Cancels a scheduled operation
    /// @param target Target address for call
    /// @param value ETH value for call
    /// @param data Calldata for call
    /// @param delay Original delay used in scheduling
    function cancel(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 delay
    ) external {
        addressBook.requireGovernance(msg.sender);

        bytes32 operationId = getOperationId(target, value, data, delay);
        Operation storage op = operations[operationId];

        require(op.timestamp > 0, "Operation doesn't exist");
        require(!op.executed, "Operation already executed");
        require(!op.canceled, "Operation already canceled");

        op.canceled = true;
        addressBook.eventEmitter().emitTimelock_OperationCanceled(operationId);
    }

    /// @notice Updates minimum delay
    /// @param newMinDelay New minimum delay
    function updateMinDelay(uint256 newMinDelay) external {
        addressBook.requireGovernance(msg.sender);
        minDelay = newMinDelay;
    }

    /// @notice Generates operation ID hash
    /// @param target Target address
    /// @param value ETH value
    /// @param data Calldata
    /// @param delay Operation delay
    /// @return Operation ID
    function getOperationId(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 delay
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(target, value, data, delay));
    }

    /// @notice Check if operation is ready
    /// @param operationId Operation hash
    /// @return Whether operation can be executed
    function isOperationReady(bytes32 operationId) external view returns (bool) {
        Operation storage op = operations[operationId];
        return !op.executed && 
               !op.canceled && 
               op.timestamp > 0 && 
               block.timestamp >= op.timestamp;
    }

    /// @notice Check if operation exists
    /// @param operationId Operation hash
    /// @return Whether operation exists
    function isOperationPending(bytes32 operationId) external view returns (bool) {
        return operations[operationId].timestamp > 0;
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }

    receive() external payable {}
}
