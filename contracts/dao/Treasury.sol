// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { AddressBook } from "../system/AddressBook.sol";
import { EventEmitter } from "../system/EventEmitter.sol";

/// @title DAO Treasury Contract
/// @notice Manages DAO funds under timelock control
/// @dev Holds and manages treasury assets for the DAO
contract Treasury is UpgradeableContract {
    using SafeERC20 for IERC20;

    /// @notice Address book contract reference
    AddressBook public addressBook;
    

    constructor() UpgradeableContract() {}

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    function initialize(address initialAddressBook) external initializer {
        require(initialAddressBook != address(0), "Invalid address book");
        
        addressBook = AddressBook(initialAddressBook);

        __UpgradeableContract_init();
    }

    /// @notice Withdraws ERC20 tokens
    /// @param token Token address
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdrawERC20(
        address token,
        address to,
        uint256 amount
    ) external {
        addressBook.requireTimelock(msg.sender);
        require(to != address(0), "Zero address recipient");
        
        IERC20(token).safeTransfer(to, amount);

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDAO_TreasuryWithdrawal(to, token, amount);
    }

    /// @notice Withdraws ETH
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdrawETH(address to, uint256 amount) external {
        addressBook.requireTimelock(msg.sender);
        require(to != address(0), "Zero address recipient");
        require(address(this).balance >= amount, "Insufficient ETH");
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDAO_TreasuryWithdrawal(to, address(0), amount);
    }

    /// @notice Returns balance of specified ERC20 token
    /// @param token Token address
    /// @return Token balance
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("Treasury");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireGovernance(msg.sender);
    }

    /// @notice Allows receiving ETH
    receive() external payable {
    }
}
