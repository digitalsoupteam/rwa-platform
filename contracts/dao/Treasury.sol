// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title DAO Treasury Contract
/// @notice Manages DAO funds under timelock control
contract Treasury is UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Emitted when tokens are withdrawn
    /// @param token Token address (address(0) for ETH)
    /// @param to Recipient address
    /// @param amount Amount withdrawn
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    /// @notice Emitted when ETH is received
    /// @param from Sender address
    /// @param amount Amount received
    event ETHReceived(address indexed from, uint256 amount);

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init();
        addressBook = AddressBook(initialAddressBook);
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
        emit Withdrawn(token, to, amount);
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
        
        emit Withdrawn(address(0), to, amount);
    }

    /// @notice Returns balance of specified ERC20 token
    /// @param token Token address
    /// @return Token balance
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }

    /// @notice Allows receiving ETH
    receive() external payable {
        emit ETHReceived(msg.sender, msg.value);
    }
}
