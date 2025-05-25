// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { AddressBook } from "../system/AddressBook.sol";
import { RWA } from "./RWA.sol";
import { Config } from "../system/Config.sol";
import { Pool } from "./Pool.sol";
import { UpgradeableContract } from "../utils/UpgradeableContract.sol";

contract Factory is UpgradeableContract, ReentrancyGuardUpgradeable {
    AddressBook public addressBook;

    mapping(bytes32 => bool) public usedSignatures;
    mapping(string => bool) public deployedEntities;

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("Factory");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireTimelock(msg.sender);
    }

    constructor() UpgradeableContract() {}

    function initialize(address initialAddressBook) external initializer {
        addressBook = AddressBook(initialAddressBook);

        __UpgradeableContract_init();
        __ReentrancyGuard_init();
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
            createRWAFee >= config.createRWAFeeMin() && createRWAFee <= config.createRWAFeeMax(),
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
        string calldata entityId,
        RWA rwa,
        uint256 expectedHoldAmount,
        uint256 expectedRwaAmount,
        uint256 priceImpactPercent,
        uint256 rewardPercent,
        uint256 entryPeriodStart,
        uint256 entryPeriodExpired,
        uint256 completionPeriodExpired,
        uint256 entryFeePercent,
        uint256 exitFeePercent,
        bool fixedSell,
        bool allowEntryBurn,
        bool awaitCompletionExpired,
        bool floatingOutTranchesTimestamps,
        uint256[] calldata outgoingTranches,
        uint256[] calldata outgoingTranchTimestamps,
        uint256[] calldata incomingTranches,
        uint256[] calldata incomingTrancheExpired,
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

        require(_addressBook.isRWA(address(rwa)), "RWA not registered in system");

        require(
            createPoolFeeRatio >= config.createPoolFeeRatioMin() &&
                createPoolFeeRatio <= config.createPoolFeeRatioMax(),
            "Pool fee ratio out of allowed range"
        );

        require(
            expectedHoldAmount >= config.expectedHoldAmountMin() &&
                expectedHoldAmount <= config.expectedHoldAmountMax(),
            "Factory: expected HOLD amount out of allowed range"
        );

        require(
            expectedRwaAmount >= config.expectedRwaAmountMin() &&
                expectedRwaAmount <= config.expectedRwaAmountMax(),
            "Factory: expected RWA amount out of allowed range"
        );

        require(
            rewardPercent >= config.rewardPercentMin() &&
                rewardPercent <= config.rewardPercentMax(),
            "Factory: reward percentage out of allowed range"
        );

        require(
            entryFeePercent >= config.entryFeePercentMin() &&
                entryFeePercent <= config.entryFeePercentMax(),
            "Factory: entry fee out of allowed range"
        );

        require(
            exitFeePercent >= config.exitFeePercentMin() &&
                exitFeePercent <= config.exitFeePercentMax(),
            "Factory: exit fee out of allowed range"
        );

        require(
            entryPeriodStart > block.timestamp - config.maxEntryStartPastOffset() &&
                entryPeriodStart < block.timestamp + config.maxEntryStartFutureOffset(),
            "Factory: entry period start out of allowed range"
        );
        require(
            outgoingTranches.length >= config.outgoingTranchesMinCount() &&
                outgoingTranches.length <= config.outgoingTranchesMaxCount(),
            "Factory: invalid outgoing tranches count"
        );
        require(
            incomingTranches.length >= config.incomingTranchesMinCount() &&
                incomingTranches.length <= config.incomingTranchesMaxCount(),
            "Factory: invalid incoming tranches count"
        );
        require(
            outgoingTranches.length == outgoingTranchTimestamps.length,
            "Factory: outgoing tranche arrays length mismatch"
        );
        require(
            incomingTranches.length == incomingTrancheExpired.length,
            "Factory: incoming tranche arrays length mismatch"
        );

        uint256 entryPeriodDuration = entryPeriodExpired - entryPeriodStart;
        require(
            entryPeriodDuration >= config.entryPeriodMinDuration() &&
                entryPeriodDuration <= config.entryPeriodMaxDuration(),
            "Factory: entry period duration out of allowed range"
        );

        uint256 completionPeriodDuration = completionPeriodExpired - entryPeriodExpired;
        require(
            completionPeriodDuration >= config.completionPeriodMinDuration() &&
                completionPeriodDuration <= config.completionPeriodMaxDuration(),
            "Factory: completion period duration out of allowed range"
        );

        require(
            outgoingTranchTimestamps[0] >= entryPeriodExpired,
            "Factory: first outgoing tranche must be after entry period"
        );

        require(
            incomingTrancheExpired[incomingTranches.length - 1] <= completionPeriodExpired,
            "Factory: last incoming tranche must be before completion period"
        );

        uint256 totalOutgoing = 0;
        for (uint256 i = 0; i < outgoingTranches.length; i++) {
            // Check tranche amount
            require(outgoingTranches[i] > 0, "Factory: zero tranche amount");

            // Check tranche percent
            uint256 tranchePercent = (outgoingTranches[i] * 10000) / expectedHoldAmount;
            require(
                tranchePercent >= config.outgoingTranchesMinPercent() &&
                    tranchePercent <= config.outgoingTranchesMaxPercent(),
                "Factory: outgoing tranche percent out of allowed range"
            );

            // Check interval between tranches
            if (i > 0) {
                require(
                    outgoingTranchTimestamps[i] >=
                        outgoingTranchTimestamps[i - 1] + config.outgoingTranchesMinInterval(),
                    "Factory: outgoing tranche interval too small"
                );
            }

            totalOutgoing += outgoingTranches[i];
        }
        require(
            totalOutgoing == expectedHoldAmount,
            "Factory: outgoing tranches must equal expected amount"
        );

        // Validate incoming tranches
        uint256 totalIncoming = 0;
        uint256 totalExpectedIncoming = expectedHoldAmount +
            (expectedHoldAmount * rewardPercent) /
            10000;

        for (uint256 i = 0; i < incomingTranches.length; i++) {
            // Check tranche amount
            require(incomingTranches[i] > 0, "Factory: zero tranche amount");

            // Check tranche percent
            uint256 tranchePercent = (incomingTranches[i] * 10000) / totalExpectedIncoming;
            require(
                tranchePercent >= config.incomingTranchesMinPercent() &&
                    tranchePercent <= config.incomingTranchesMaxPercent(),
                "Factory: incoming tranche percent out of allowed range"
            );

            // Check interval between tranches
            if (i > 0) {
                require(
                    incomingTrancheExpired[i] >=
                        incomingTrancheExpired[i - 1] + config.incomingTranchesMinInterval(),
                    "Factory: incoming tranche interval too small"
                );
            }

            totalIncoming += incomingTranches[i];
        }
        require(
            totalIncoming == totalExpectedIncoming,
            "Factory: incoming tranches must equal total expected amount"
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
                            entityId,
                            address(rwa),
                            expectedHoldAmount,
                            expectedRwaAmount,
                            priceImpactPercent,
                            rewardPercent,
                            entryPeriodStart,
                            entryPeriodExpired,
                            completionPeriodExpired,
                            entryFeePercent,
                            exitFeePercent,
                            fixedSell,
                            allowEntryBurn,
                            awaitCompletionExpired,
                            floatingOutTranchesTimestamps,
                            outgoingTranches,
                            outgoingTranchTimestamps,
                            incomingTranches,
                            incomingTrancheExpired
                        )
                    ),
                    expired
                )
            )
        );

        _validateSignatures(signers, signatures, messageHash);

        address implementation = _addressBook.poolImplementation();
        require(implementation != address(0), "Pool implementation not set");

        address proxy = address(new ERC1967Proxy(implementation, ""));
        uint256 rwaId = rwa.createToken(proxy);

        _addressBook.addPool(Pool(proxy));

        // Calculate values
        uint256 liquidityCoefficient = config.getLiquidityCoefficient(priceImpactPercent);
        uint256 expectedBonusAmount = (expectedHoldAmount * rewardPercent) / 10000;

        Pool(proxy).initialize(
            address(config.holdToken()),
            address(rwa),
            _addressBook,
            rwaId,
            entityId,
            rwa.entityOwnerId(),
            rwa.entityOwnerType(),
            rwa.owner(),
            expectedHoldAmount,
            expectedRwaAmount,
            priceImpactPercent,
            liquidityCoefficient,
            entryFeePercent,
            exitFeePercent,
            entryPeriodStart,
            entryPeriodExpired,
            completionPeriodExpired,
            rewardPercent,
            expectedBonusAmount,
            fixedSell,
            allowEntryBurn,
            awaitCompletionExpired,
            floatingOutTranchesTimestamps,
            outgoingTranches,
            outgoingTranchTimestamps,
            incomingTranches,
            incomingTrancheExpired
        );

        deployedEntities[entityId] = true;
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
}
