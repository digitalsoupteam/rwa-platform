// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title DAO Governance Token
/// @notice Simple ERC20 token for DAO governance
contract DaoToken is UUPSUpgradeable, ERC20Upgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialName Token name
    /// @param initialSymbol Token symbol
    /// @param initialHolders List of initail holders (users/contracts)
    /// @param initialSymbol List of initial amount (index to holders)
    function initialize(
        address initialAddressBook,
        string calldata initialName,
        string calldata initialSymbol,
        address[] calldata initialHolders,
        uint256[] calldata initialAmounts
    ) external initializer {
        __UUPSUpgradeable_init();
        __ERC20_init(initialName, initialSymbol);
        addressBook = AddressBook(initialAddressBook);

        require(initialHolders.length == initialAmounts.length, "initialHolders length!");
        for (uint256 i; i < initialHolders.length; ++i) {
            _mint(initialHolders[i], initialAmounts[i]);
        }
    }

    /// @notice Override transfer function to emit additional event
    function _transfer(address from, address to, uint256 amount) internal virtual override {
        super._transfer(from, to, amount);
        addressBook.eventEmitter().emitDaoToken_Transfer(from, to, amount);
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
