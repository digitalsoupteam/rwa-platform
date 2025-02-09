// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import { AddressBook } from "../system/AddressBook.sol";

/// @title Referral Treasury Contract
/// @notice Stores tokens and allows withdrawal with backend signature
contract ReferralTreasury is UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Mapping to track used signatures
    mapping(bytes32 => bool) public usedSignatures;

    /// @notice Emitted when tokens are withdrawn
    /// @param user Address of withdrawer
    /// @param token Token address
    /// @param amount Amount withdrawn
    event Withdrawn(address indexed user, address indexed token, uint256 amount);

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

    /// @notice Withdraws tokens with backend signature verification
    /// @param token Token address to withdraw
    /// @param amount Amount to withdraw
    /// @param deadline Timestamp until which signature is valid
    /// @param signature Backend signature
    function withdraw(
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
                    "withdraw",
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

        IERC20(token).safeTransfer(msg.sender, amount);
        
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Emergency withdrawal of stuck tokens by governance
    /// @param token Token address to withdraw
    /// @param to Address to send tokens to
    /// @param amount Amount to withdraw
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external {
        addressBook.requireGovernance(msg.sender);
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Authorizes upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
