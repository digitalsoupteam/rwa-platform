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
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialName Token name
    /// @param initialSymbol Token symbol
    function initialize(
        address initialAddressBook,
        string calldata initialName,
        string calldata initialSymbol
    ) external initializer {
        require(initialAddressBook != address(0), "Invalid address book");

        addressBook = AddressBook(initialAddressBook);

        __UpgradeableContract_init();
        __ERC20_init_unchained(initialName, initialSymbol);
    }

    /// @notice Mints tokens to multiple addresses
    /// @dev Can only be called by governance
    /// @param holders Array of addresses to receive tokens
    /// @param amounts Array of amounts to mint
    function mint(
        address[] calldata holders,
        uint256[] calldata amounts
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(holders.length == amounts.length, "Arrays length mismatch");
        require(holders.length > 0, "Empty arrays");

        for(uint256 i = 0; i < holders.length; i++) {
            require(holders[i] != address(0), "Zero address recipient");
            _mint(holders[i], amounts[i]);
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
