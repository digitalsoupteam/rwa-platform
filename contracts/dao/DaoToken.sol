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

    /// @notice Emitted when tokens are minted
    /// @param operator Address performing the mint
    /// @param to Recipient address
    /// @param amount Amount minted
    event TokensMinted(address indexed operator, address indexed to, uint256 amount);

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialName Token name
    /// @param initialSymbol Token symbol
    function initialize(
        address initialAddressBook,
        string calldata initialName,
        string calldata initialSymbol
    ) external initializer {
        __UUPSUpgradeable_init();
        __ERC20_init(initialName, initialSymbol);
        addressBook = AddressBook(initialAddressBook);
    }

    /// @notice Mints new tokens
    /// @param to Address to receive tokens
    /// @param amount Amount to mint
    function mint(address to, uint256 amount) external {
        addressBook.requireTimelock(msg.sender);
        _mint(to, amount);
        emit TokensMinted(msg.sender, to, amount);
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
