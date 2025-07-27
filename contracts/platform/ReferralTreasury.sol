// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import { AddressBook } from "../system/AddressBook.sol";
import { Config } from "../system/Config.sol";
import { EventEmitter } from "../system/EventEmitter.sol";
import { UpgradeableContract } from "../utils/UpgradeableContract.sol";

/// @title Referral Treasury Contract
/// @notice Stores tokens and allows withdrawal with multiple signature verification
contract ReferralTreasury is UpgradeableContract, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Mapping to track used signatures
    mapping(bytes32 => bool) public usedSignatures;

    /// @notice Constructor that disables initializers
    constructor() UpgradeableContract() {}

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    function initialize(address initialAddressBook) external initializer {
        __UpgradeableContract_init();
        __ReentrancyGuard_init();
        addressBook = AddressBook(initialAddressBook);
    }

    /// @notice Withdraws tokens with multiple signature verification
    /// @param token Token address to withdraw
    /// @param amount Amount to withdraw
    /// @param deadline Timestamp until which signature is valid
    /// @param signers Array of signer addresses
    /// @param signatures Array of signatures
    function withdraw(
        address token,
        uint256 amount,
        uint256 deadline,
        address[] calldata signers,
        bytes[] calldata signatures
    ) external nonReentrant {
        require(block.timestamp <= deadline, "Request has expired");
        require(amount > 0, "Amount must be greater than zero");
        
        AddressBook _addressBook = addressBook;
        Config config = _addressBook.config();

        require(signers.length == signatures.length, "Signers and signatures length mismatch");
        require(signers.length >= config.minSignersRequired(), "Insufficient signatures");

        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(
                    keccak256(
                        abi.encodePacked(
                            block.chainid,
                            address(this),
                            msg.sender,
                            "withdraw",
                            token,
                            amount
                        )
                    ),
                    deadline
                )
            )
        );

        _validateSignatures(signers, signatures, messageHash);

        IERC20(token).safeTransfer(msg.sender, amount);
        
        EventEmitter eventEmitter = _addressBook.eventEmitter();
        eventEmitter.emitReferralTreasury_Withdrawn(msg.sender, token, amount);
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
        AddressBook _addressBook = addressBook;
        _addressBook.requireGovernance(msg.sender);
        require(amount > 0, "Amount must be greater than zero");
        
        IERC20(token).safeTransfer(to, amount);
        
        EventEmitter eventEmitter = _addressBook.eventEmitter();
        eventEmitter.emitReferralTreasury_EmergencyWithdrawn(to, token, amount, msg.sender);
    }

    /// @notice Validates multiple signatures
    /// @param signers Array of signer addresses
    /// @param signatures Array of signatures
    /// @param messageHash Hash of the message to verify
    function _validateSignatures(
        address[] calldata signers,
        bytes[] calldata signatures,
        bytes32 messageHash
    ) internal {
        AddressBook _addressBook = addressBook;
        for (uint256 i = 0; i < signers.length; i++) {
            bytes32 signatureHash = keccak256(signatures[i]);
            require(!usedSignatures[signatureHash], "Duplicate signature");
            require(_addressBook.signers(signers[i]), "Not an authorized signer");
            require(
                SignatureChecker.isValidSignatureNow(signers[i], messageHash, signatures[i]),
                "Invalid signature"
            );
            usedSignatures[signatureHash] = true;
        }
    }

    /// @notice Returns unique contract identifier
    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("ReferralTreasury");
    }

    /// @notice Returns implementation version
    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    /// @notice Verifies authorization for upgrade
    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireUpgradeRole(msg.sender);
    }
}
