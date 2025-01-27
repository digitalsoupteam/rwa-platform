// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title Airdrop contract for ERC20 token distribution
/// @notice Allows claiming tokens with backend signature verification
contract Airdrop is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;
    
    /// @notice Mapping to track used signatures
    mapping(bytes32 => bool) public usedSignatures;

    /// @notice Emitted when tokens are claimed
    /// @param user Address of claimer
    /// @param token ERC20 token address
    /// @param amount Amount of tokens claimed
    event Claimed(address indexed user, address indexed token, uint256 amount);

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init_unchained();
        addressBook = AddressBook(initialAddressBook);
    }

    /// @notice Claims tokens with signature verification
    /// @param token ERC20 token address to claim
    /// @param amount Amount of tokens to claim
    /// @param deadline Timestamp until which signature is valid
    /// @param signature Signature from backend
    function claim(
        address token,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "Signature expired");

        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(
                    block.chainid,
                    address(this),
                    msg.sender,
                    "claim",
                    token,
                    amount,
                    deadline
                )
            )
        );

        require(!usedSignatures[messageHash], "Signature already used");
        require(
            SignatureChecker.isValidSignatureNow(addressBook.backend(), messageHash, signature),
            "Backend signature check failed"
        );

        usedSignatures[messageHash] = true;
        
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
        
        emit Claimed(msg.sender, token, amount);
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
