// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { AddressBook } from "../system/AddressBook.sol";

/// @title Platform Token Contract
/// @notice ERC20 token
/// @dev Upgradeable ERC20 token for platform governance and rewards
contract PlatformToken is UpgradeableContract, ERC20Upgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    constructor() UpgradeableContract() {}

    /// @notice Initializes the contract
    /// @dev Mints tokens to multiple addresses
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialName Token name
    /// @param initialSymbol Token symbol
    /// @param initialHolders Array of addresses to receive tokens
    /// @param initialAmounts Array of amounts to mint
    function initialize(
        address initialAddressBook,
        string calldata initialName,
        string calldata initialSymbol,
        address[] calldata initialHolders, 
        uint256[] calldata initialAmounts
    ) external initializer {
        require(initialAddressBook != address(0), "Invalid address book");
        require(initialHolders.length == initialAmounts.length, "Arrays length mismatch");
        require(initialHolders.length > 0, "Empty arrays");

        addressBook = AddressBook(initialAddressBook);

        __UpgradeableContract_init();
        __ERC20_init_unchained(initialName, initialSymbol);

        for(uint256 i = 0; i < initialHolders.length; i++) {
            require(initialHolders[i] != address(0), "Zero address recipient");
            _mint(initialHolders[i], initialAmounts[i]);
        }
    }

    /// @notice Override transfer function to emit additional event
    function _update(address from, address to, uint256 amount) internal virtual override {
        super._update(from, to, amount);
        
        addressBook.eventEmitter().emitPlatformToken_Transfer(from, to, amount);
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("PlatformToken");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireUpgradeRole(msg.sender);
    }
}
