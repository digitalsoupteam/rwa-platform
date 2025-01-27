// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

import { ERC1155SupplyUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import { AddressBook } from "../system/AddressBook.sol";

/// @title RWA Token Contract
/// @notice Contract for managing real world asset tokens
/// @dev Implements ERC1155 standard with upgradeable functionality
contract RWA is UUPSUpgradeable, ERC1155Upgradeable, ERC1155SupplyUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Product owner address
    address public productOwner;

    /// @notice Mapping of token ID to pool address
    mapping(uint256 => address) public pools;

    /// @notice Mapping of token ID to maximum supply
    mapping(uint256 => uint256) public supplies;

    /// @notice Unique token ID amount
    uint256 public tokensLength;

    /// @notice Prevents initialization of implementation contract
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @dev Can only be called once
    /// @param initialAddressBook Address of the AddressBook contract
    function initialize(
        address initialAddressBook,
        address initialProductOwner,
        string memory initialUri
    ) external initializer {
        require(initialProductOwner != address(0), "Invalid product owner");
        require(initialAddressBook != address(0), "Invalid addressBook");

        __UUPSUpgradeable_init_unchained();
        __ERC1155_init_unchained(initialUri);
        addressBook = AddressBook(initialAddressBook);
        productOwner = initialProductOwner;
    }

    /// @notice Authorizes an upgrade to a new implementation
    /// @dev Can only be called by governance address
    /// @param newImplementation Address of the new implementation contract
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }

    /// @notice override base function
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override(ERC1155Upgradeable, ERC1155SupplyUpgradeable) {
        super._update(from, to, ids, values);
    }

    /// @notice Creates a new token with specified parameters
    /// @dev Can only be called by the factory address registered in AddressBook
    /// @param pool The address of the pool managing this token
    /// @param initialSupply The maximum supply for this token
    /// @return uint256 token id
    function createToken(address pool, uint256 initialSupply) external returns (uint256) {
        addressBook.requireFactory(msg.sender);
        uint256 tokenId = ++tokensLength;
        require(pools[tokenId] == address(0), "Token already exists");
        require(pool != address(0), "Invalid pool address");
        require(initialSupply > 0, "Supply must be greater than 0");

        pools[tokenId] = pool;
        supplies[tokenId] = initialSupply;

        return tokenId;
    }

    /// @notice Mints tokens
    /// @dev Can only be called by the associated pool
    /// @param account The address to mint tokens to
    /// @param tokenId The ID of the token to mint
    /// @param amount The amount of tokens to mint
    function mint(address account, uint256 tokenId, uint256 amount) external {
        require(msg.sender == pools[tokenId], "Only pool can mint");
        require(account != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");

        uint256 currentSupply = totalSupply(tokenId);
        require(currentSupply + amount <= supplies[tokenId], "Exceeds maximum supply");

        _mint(account, tokenId, amount, "");
    }

    /// @notice Burns tokens
    /// @dev Can only be called by the associated pool
    /// @param account The address to burn tokens from
    /// @param tokenId The ID of the token to burn
    /// @param amount The amount of tokens to burn
    function burn(address account, uint256 tokenId, uint256 amount) external {
        require(msg.sender == pools[tokenId], "Only pool can burn");
        require(account != address(0), "Invalid account");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(account, tokenId) >= amount, "Insufficient balance");

        _burn(account, tokenId, amount);
    }
}
