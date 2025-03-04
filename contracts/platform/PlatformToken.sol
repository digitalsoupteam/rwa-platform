// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title Platform Token Contract
/// @notice ERC20 token with batch mint functionality
contract PlatformToken is UUPSUpgradeable, ERC20Upgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Emitted when tokens are batch minted
    /// @param operator Address performing the mint
    /// @param recipients Array of recipient addresses
    /// @param amounts Array of amounts minted
    event BatchMint(address indexed operator, address[] recipients, uint256[] amounts);

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @dev Mints tokens to multiple addresses
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialName Token name
    /// @param initialSymbol Token symbol
    /// @param initialHolders Array of addresses to receive tokens
    /// @param initilaAmounts Array of amounts to mint
    function initialize(
        address initialAddressBook,
        string calldata initialName,
        string calldata initialSymbol,
        address[] calldata initialHolders, 
        uint256[] calldata initilaAmounts
    ) external initializer {
        __UUPSUpgradeable_init_unchained();
        __ERC20_init_unchained(initialName, initialSymbol);
        addressBook = AddressBook(initialAddressBook);

        require(initialHolders.length == initilaAmounts.length, "Arrays length mismatch");
        require(initialHolders.length > 0, "Empty arrays");

        for(uint256 i = 0; i < initialHolders.length; i++) {
            require(initialHolders[i] != address(0), "Zero address recipient");
            _mint(initialHolders[i], initilaAmounts[i]);
        }
    }

    /// @notice Override transfer function to emit additional event
    function _update(address from, address to, uint256 amount) internal virtual override {
        super._update(from, to, amount);
        addressBook.eventEmitter().emitPlatformToken_Transfer(from, to, amount);
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
