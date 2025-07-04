// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { ERC1155SupplyUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { AddressBook } from "../system/AddressBook.sol";

/// @title RWA Token Contract
/// @notice Contract for managing real world asset tokens
/// @dev Implements ERC1155 standard with upgradeable functionality
contract RWA is UpgradeableContract, ERC1155Upgradeable, ERC1155SupplyUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Emergency pause flag
    bool public paused;

    /// @notice Owner address
    address public owner;

    string public entityId;
    string public entityOwnerId;
    string public entityOwnerType;

    /// @notice Mapping of token ID to pool address
    mapping(uint256 => address) public pools;

    /// @notice Unique token ID amount
    uint256 public tokensLength;

    constructor() UpgradeableContract() {}

    /// @notice Initializes the contract
    /// @dev Can only be called once
    /// @param initialAddressBook Address of the AddressBook contract
    function initialize(
        address initialAddressBook,
        address deployer,
        address initialOwner,
        string memory initialEntityId,
        string memory initialEntityOwnerId,
        string memory initialEntityOwnerType
    ) external initializer {
        require(initialOwner != address(0), "Invalid owner");
        require(initialAddressBook != address(0), "Invalid addressBook");

        __UpgradeableContract_init();
        __ERC1155_init_unchained("");
        __ERC1155Supply_init_unchained();
        addressBook = AddressBook(initialAddressBook);
        owner = initialOwner;
        entityId = initialEntityId;
        entityOwnerId = initialEntityOwnerId;
        entityOwnerType = initialEntityOwnerType;

        addressBook.eventEmitter().emitRWA_Deployed(
            deployer,
            initialOwner,
            initialEntityId
        );
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("RWA");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireTimelock(msg.sender);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(UpgradeableContract, ERC1155Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @notice override base function
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override(ERC1155Upgradeable, ERC1155SupplyUpgradeable) {
        require(!paused, "RWA: paused");
        super._update(from, to, ids, values);
        
        // Emit our custom event for each token transfer
        for (uint256 i = 0; i < ids.length; i++) {
            addressBook.eventEmitter().emitRWA_Transfer(from, to, ids[i], values[i], pools[ids[i]]);
        }
    }

    /// @notice Creates a new token with specified parameters
    /// @dev Can only be called by the factory address registered in AddressBook
    /// @param pool The address of the pool managing this token
    /// @return uint256 token id
    function createToken(address pool) external returns (uint256) {
        require(!paused, "RWA: paused");
        addressBook.requireFactory(msg.sender);
        uint256 tokenId = ++tokensLength;
        require(pools[tokenId] == address(0), "Token already exists");
        require(pool != address(0), "Invalid pool address");

        pools[tokenId] = pool;

        return tokenId;
    }

    /// @notice Mints tokens
    /// @dev Can only be called by the associated pool
    /// @param account The address to mint tokens to
    /// @param tokenId The ID of the token to mint
    /// @param amount The amount of tokens to mint
    function mint(address account, uint256 tokenId, uint256 amount) external {
        require(!paused, "RWA: paused");
        require(msg.sender == pools[tokenId], "Only pool can mint");
        require(account != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");

        _mint(account, tokenId, amount, "");
    }

    /// @notice Burns tokens
    /// @dev Can only be called by the associated pool
    /// @param account The address to burn tokens from
    /// @param tokenId The ID of the token to burn
    /// @param amount The amount of tokens to burn
    function burn(address account, uint256 tokenId, uint256 amount) external {
        require(!paused, "RWA: paused");
        require(msg.sender == pools[tokenId], "Only pool can burn");
        require(account != address(0), "Invalid account");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(account, tokenId) >= amount, "Insufficient balance");
        _burn(account, tokenId, amount);
    }

    /// @notice Gets the metadata URI for a specific token
    /// @param tokenId The ID of the token
    /// @return string The complete metadata URI for the token
    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenId != 0 && tokenId <= tokensLength, "URI query for nonexistent token");

        string memory baseUri = addressBook.config().baseMetadataUri();
        return string(
            abi.encodePacked(
                baseUri,
                "/",
                Strings.toHexString(address(this)),
                "/",
                Strings.toString(tokenId)
            )
        );
    }

    /// @notice Enables emergency pause on the contract
    /// @dev Can only be called by governance. Contract operations will be blocked.
    function enablePause() external {
        addressBook.requireGovernance(msg.sender);
        require(!paused, "RWA: already paused");
        paused = true;
        addressBook.eventEmitter().emitRWA_PausedStateChanged(true);
    }

    /// @notice Disables emergency pause on the contract
    /// @dev Can only be called by governance. Contract operations will be unblocked.
    function disablePause() external {
        addressBook.requireTimelock(msg.sender);
        require(paused, "RWA: not paused");
        paused = false;
        addressBook.eventEmitter().emitRWA_PausedStateChanged(false);
    }
}
