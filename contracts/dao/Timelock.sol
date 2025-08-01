// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { AddressBook } from "../system/AddressBook.sol";
import { Config } from "../system/Config.sol";
import { EventEmitter } from "../system/EventEmitter.sol";

/// @title DAO Timelock Contract
/// @notice Enforces delay on governance actions for security
/// @dev Implements timelock mechanism for governance proposals
contract Timelock is UpgradeableContract, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Queued transactions
    mapping(bytes32 => uint256) public queuedTransactions;

    /// @notice Grace period for execution after ETA (7 days)
    uint256 public constant GRACE_PERIOD = 7 days;

    constructor() UpgradeableContract() {}

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    function initialize(address initialAddressBook) external initializer {
        require(initialAddressBook != address(0), "Invalid address book");

        addressBook = AddressBook(initialAddressBook);

        __UpgradeableContract_init();
        __ReentrancyGuard_init();
    }

    /// @notice Queues a transaction for future execution
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @param eta Earliest time for execution
    /// @return txHash Hash of the queued transaction
    function queueTransaction(
        address target,
        bytes memory data,
        uint256 eta
    ) external returns (bytes32 txHash) {
        addressBook.requireGovernance(msg.sender);

        Config config = addressBook.config();
        require(eta >= block.timestamp + config.timelockDelay(), "ETA too early");

        txHash = keccak256(abi.encode(target, data, eta));
        require(queuedTransactions[txHash] == 0, "Transaction already queued");

        queuedTransactions[txHash] = eta;

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitTimelock_TransactionQueued(txHash, target, data, eta);

        return txHash;
    }

    /// @notice Executes a queued transaction
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @param eta Execution time
    function executeTransaction(
        address target,
        bytes memory data,
        uint256 eta
    ) external nonReentrant {
        bytes32 txHash = keccak256(abi.encode(target, data, eta));
        uint256 queuedEta = queuedTransactions[txHash];

        require(queuedEta != 0, "Transaction not queued");
        require(block.timestamp >= queuedEta, "Transaction not ready");
        require(block.timestamp <= queuedEta + GRACE_PERIOD, "Transaction expired");

        delete queuedTransactions[txHash];

        (bool success, bytes memory returnData) = target.call(data);
        require(success, _getRevertMsg(returnData));

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitTimelock_TransactionExecuted(txHash, target, data, eta);
    }

    /// @notice Cancels a queued transaction
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @param eta Execution time
    function cancelTransaction(address target, bytes memory data, uint256 eta) external {
        addressBook.requireGovernance(msg.sender);

        bytes32 txHash = keccak256(abi.encode(target, data, eta));
        require(queuedTransactions[txHash] != 0, "Transaction not queued");

        delete queuedTransactions[txHash];

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitTimelock_TransactionCancelled(txHash, target, data, eta);
    }

    /// @notice Checks if a transaction is queued
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @param eta Execution time
    /// @return True if transaction is queued
    function isTransactionQueued(
        address target,
        bytes memory data,
        uint256 eta
    ) external view returns (bool) {
        bytes32 txHash = keccak256(abi.encode(target, data, eta));
        return queuedTransactions[txHash] != 0;
    }

    /// @notice Gets the ETA for a queued transaction
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @param eta Execution time
    /// @return The ETA timestamp
    function getTransactionETA(
        address target,
        bytes memory data,
        uint256 eta
    ) external view returns (uint256) {
        bytes32 txHash = keccak256(abi.encode(target, data, eta));
        return queuedTransactions[txHash];
    }

    /// @notice Checks if a transaction is ready for execution
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @param eta Execution time
    /// @return True if ready for execution
    function isTransactionReady(
        address target,
        bytes memory data,
        uint256 eta
    ) external view returns (bool) {
        bytes32 txHash = keccak256(abi.encode(target, data, eta));
        uint256 queuedEta = queuedTransactions[txHash];

        return
            queuedEta != 0 &&
            block.timestamp >= queuedEta &&
            block.timestamp <= queuedEta + GRACE_PERIOD;
    }

    /// @notice Extracts revert message from failed call
    /// @param returnData The return data from failed call
    /// @return Revert message string
    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "Transaction reverted silently";

        assembly {
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string));
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("Timelock");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireUpgradeRole(msg.sender);
    }

    /// @notice Allows receiving ETH
    receive() external payable {}

    /// @notice Withdraws ERC20 tokens
    /// @param token Token address
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdrawERC20(address token, address to, uint256 amount) external nonReentrant {
        addressBook.requireTimelock(msg.sender);
        require(to != address(0), "Zero address recipient");

        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Withdraws ETH
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdrawETH(address to, uint256 amount) external nonReentrant {
        addressBook.requireTimelock(msg.sender);
        require(to != address(0), "Zero address recipient");
        require(address(this).balance >= amount, "Insufficient ETH");

        (bool success, ) = to.call{ value: amount }("");
        require(success, "ETH transfer failed");
    }
}
