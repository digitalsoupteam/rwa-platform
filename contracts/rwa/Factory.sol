// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { AddressBook } from "../system/AddressBook.sol";
import { RWA } from "./RWA.sol";
import { BasePool } from "./pools/BasePool.sol";
import { Config } from "../system/Config.sol";

contract Factory is UUPSUpgradeable, ReentrancyGuardUpgradeable {
    AddressBook public addressBook;

    mapping(bytes32 => bool) public usedSignatures;
    mapping(string => bool) public deployedEntities;

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        addressBook = AddressBook(initialAddressBook);
    }

    function deployRWA(
        uint256 createRWAFee,
        string calldata entityId,
        string calldata entityOwnerId,
        string calldata entityOwnerType,
        address owner,
        address[] calldata signers,
        bytes[] calldata signatures,
        uint256 expired
    ) external nonReentrant returns (address) {
        require(block.timestamp <= expired, "Request has expired");
        require(!deployedEntities[entityId], "Entity already deployed");

        AddressBook _addressBook = addressBook;
        Config config = _addressBook.config();

        require(signers.length == signatures.length, "Signers and signatures length mismatch");
        require(signers.length >= config.minSignersRequired(), "Insufficient signatures");

        require(
            createRWAFee >= config.minCreateRWAFee() && createRWAFee <= config.maxCreateRWAFee(),
            "RWA fee out of allowed range"
        );

        config.holdToken().transferFrom(
            msg.sender,
            address(_addressBook.treasury()),
            createRWAFee * 10 ** IERC20Metadata(address(config.holdToken())).decimals()
        );

        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(
                    keccak256(
                        abi.encodePacked(
                            block.chainid,
                            address(this),
                            msg.sender,
                            "deployRWA",
                            createRWAFee,
                            entityId,
                            entityOwnerId,
                            entityOwnerType,
                            owner
                        )
                    ),
                    expired
                )
            )
        );

        _validateSignatures(signers, signatures, messageHash);

        address proxy = address(new ERC1967Proxy(_addressBook.rwaImplementation(), ""));
        RWA rwa = RWA(proxy);
        _addressBook.addRWA(rwa);
        rwa.initialize(address(_addressBook), owner, entityId, entityOwnerId, entityOwnerType);

        return proxy;
    }

    function deployPool(
        uint256 createPoolFeeRatio,
        string calldata poolType,
        string calldata entityId,
        string calldata entityOwnerId,
        string calldata entityOwnerType,
        address owner,
        RWA rwa,
        uint256 expectedHoldAmount,
        uint256 rewardPercent,
        uint256 entryPeriodDuration,
        uint256 completionPeriodDuration,
        bytes calldata payload,
        address[] calldata signers,
        bytes[] calldata signatures,
        uint256 expired
    ) external nonReentrant returns (address) {
        require(block.timestamp <= expired, "Request has expired");
        require(!deployedEntities[entityId], "Entity already deployed");

        AddressBook _addressBook = addressBook;
        Config config = _addressBook.config();

        require(signers.length == signatures.length, "Signers and signatures length mismatch");
        require(signers.length >= config.minSignersRequired(), "Insufficient signatures");

        require(
            expectedHoldAmount >= config.minExpectedHoldAmount() &&
                expectedHoldAmount <= config.maxExpectedHoldAmount(),
            "Expected HOLD amount out of allowed range"
        );

        require(
            rewardPercent >= config.minRewardPercent() &&
                rewardPercent <= config.maxRewardPercent(),
            "Reward percentage out of allowed range"
        );

        require(
            entryPeriodDuration >= config.minEntryPeriodDuration() &&
                entryPeriodDuration <= config.maxEntryPeriodDuration(),
            "Entry period duration out of allowed range"
        );

        require(
            completionPeriodDuration >= config.minCompletionPeriodDuration() &&
                completionPeriodDuration <= config.maxCompletionPeriodDuration(),
            "Completion period duration out of allowed range"
        );

        require(_addressBook.isRWA(address(rwa)), "RWA not registered in system");
        require(rwa.owner() == owner, "Caller is not RWA owner");
        require(
            keccak256(bytes(rwa.entityOwnerId())) == keccak256(bytes(entityOwnerId)) &&
            keccak256(bytes(rwa.entityOwnerType())) == keccak256(bytes(entityOwnerType)),
            "Entity owner details mismatch with RWA"
        );

        require(
            createPoolFeeRatio >= config.minCreatePoolFeeRatio() &&
                createPoolFeeRatio <= config.maxCreatePoolFeeRatio(),
            "Pool fee ratio out of allowed range"
        );

        IERC20 holdToken = config.holdToken();
        holdToken.transferFrom(
            msg.sender,
            address(_addressBook.treasury()),
            (expectedHoldAmount * createPoolFeeRatio) / 10000
        );

        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(
                    keccak256(
                        abi.encodePacked(
                            block.chainid,
                            address(this),
                            msg.sender,
                            "deployPool",
                            createPoolFeeRatio,
                            poolType,
                            entityId,
                            entityOwnerId,
                            entityOwnerType,
                            owner,
                            address(rwa),
                            expectedHoldAmount,
                            rewardPercent,
                            entryPeriodDuration,
                            completionPeriodDuration,
                            payload
                        )
                    ),
                    expired
                )
            )
        );

        _validateSignatures(signers, signatures, messageHash);

        uint256 expectedRwaAmount = config.baseRwaAmount();

        address implementation;
        if (keccak256(bytes(poolType)) == keccak256(bytes("stable"))) {
            implementation = _addressBook.poolStableImplementation();
        } else if (keccak256(bytes(poolType)) == keccak256(bytes("speculation"))) {
            implementation = _addressBook.poolSpeculationImplementation();
        } else {
            revert("Invalid pool type");
        }

        address proxy = address(new ERC1967Proxy(implementation, ""));
        uint256 rwaId = rwa.createToken(proxy);

        uint256 entryPeriodExpired = block.timestamp + entryPeriodDuration;
        uint256 completionPeriodExpired = block.timestamp + completionPeriodDuration;

        uint256 entryFeePercent = config.entryFeePercent();
        uint256 exitFeePercent = config.exitFeePercent();

        _addressBook.addPool(BasePool(proxy));

        BasePool(proxy).initialize(
            address(addressBook),
            address(config.holdToken()),
            entityId,
            entityOwnerId,
            entityOwnerType,
            address(rwa),
            rwaId,
            entryFeePercent,
            exitFeePercent,
            expectedHoldAmount,
            expectedRwaAmount,
            rewardPercent,
            entryPeriodExpired,
            completionPeriodExpired,
            owner,
            payload
        );

        return proxy;
    }

    function _validateSignatures(
        address[] calldata signers,
        bytes[] calldata signatures,
        bytes32 messageHash
    ) internal {
        for (uint256 i = 0; i < signers.length; i++) {
            bytes32 signatureHash = keccak256(signatures[i]);
            require(!usedSignatures[signatureHash], "Duplicate signature");
            require(addressBook.signers(signers[i]), "Not an authorized signer");
            require(
                SignatureChecker.isValidSignatureNow(signers[i], messageHash, signatures[i]),
                "Invalid signature"
            );
            usedSignatures[signatureHash] = true;
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
        require(newImplementation.code.length > 0, "ERC1967: new implementation is not a contract");
    }
}
