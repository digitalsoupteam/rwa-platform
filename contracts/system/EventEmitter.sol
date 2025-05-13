// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "./AddressBook.sol";

contract EventEmitter is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;
    
    uint256 public genesisBlock;

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init_unchained();

        require(initialAddressBook != address(0), "Invalid address book");
        addressBook = AddressBook(initialAddressBook);
        genesisBlock = block.number;
    }

    // --- Pool Events Start ---

    event Pool_OutgoingTrancheClaimed(
        address indexed emittedFrom, // Pool contract address
        address indexed claimer,
        uint256 trancheIndex,
        uint256 amountClaimed
    );

    event Pool_OutgoingClaimSummary(
        address indexed emittedFrom, // Pool contract address
        uint256 totalClaimedAmount,
        uint256 outgoingTranchesBalance
    );

    event Pool_IncomingTrancheUpdate(
        address indexed emittedFrom, // Pool contract address
        address indexed returner,
        uint256 trancheIndex,
        uint256 amountAppliedToTranche,
        bool isNowComplete,
        bool wasOnTime
    );

    event Pool_IncomingReturnSummary(
        address indexed emittedFrom, // Pool contract address
        uint256 totalReturnedAmount,
        uint256 lastCompletedIncomingTranche
    );

    event Pool_FundsFullyReturned(
        address indexed emittedFrom, // Pool contract address
        uint256 timestamp
    );

    event Pool_RwaMinted(
        address indexed emittedFrom, // Pool contract address
        address indexed minter,
        uint256 rwaAmountMinted,
        uint256 holdAmountPaid,
        uint256 feePaid
    );

    event Pool_TargetReached(
        address indexed emittedFrom, // Pool contract address
        uint256 outgoingTranchesBalance,
        uint256 floatingTimestampOffset
    );

    event Pool_RwaBurned(
        address indexed emittedFrom, // Pool contract address
        address indexed burner,
        uint256 rwaAmountBurned,
        uint256 holdAmountReceived,
        uint256 bonusAmountReceived,
        uint256 holdFeePaid,
        uint256 bonusFeePaid
    );

    event Pool_AwaitingRwaAmountUpdated(
        address indexed emittedFrom, // Pool contract address
        uint256 awaitingRwaAmount
    );

    event Pool_AwaitingBonusAmountUpdated(
        address indexed emittedFrom, // Pool contract address
        uint256 awaitingBonusAmount
    );

    event Pool_ReservesUpdated(
        address indexed emittedFrom, // Pool contract address
        uint256 realHoldReserve,
        uint256 virtualHoldReserve,
        uint256 virtualRwaReserve
    );

    event Pool_PausedStateChanged(
        address indexed emittedFrom, // Pool contract address
        bool isPaused
    );

    event Pool_Deployed(
        address indexed emittedFrom, // Pool contract address
        bool bonusAfterCompletion,
        bool floatingOutTranchesTimestamps,
        address holdToken,
        address rwaToken,
        address addressBook,
        uint256 tokenId,
        string entityId,
        string entityOwnerId,
        string entityOwnerType,
        address owner,
        uint256 expectedHoldAmount,
        uint256 expectedRwaAmount,
        uint256 expectedBonusAmount,
        uint256 rewardPercent,
        bool fixedSell,
        bool allowEntryBurn,
        uint256 entryPeriodStart,
        uint256 entryPeriodExpired,
        uint256 completionPeriodExpired,
        uint256 k,
        uint256 entryFeePercent,
        uint256 exitFeePercent,
        uint256[] outgoingTranches,
        uint256[] outgoingTranchTimestamps,
        uint256[] incomingTranches,
        uint256[] incomingTrancheExpired
    );

    // --- Pool Emitter Functions Start ---

    function emitPool_OutgoingTrancheClaimed(
        address claimer,
        uint256 trancheIndex,
        uint256 amountClaimed
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_OutgoingTrancheClaimed(
            msg.sender, 
            claimer,
            trancheIndex,
            amountClaimed
        );
    }

    function emitPool_OutgoingClaimSummary(
        uint256 totalClaimedAmount,
        uint256 outgoingTranchesBalance
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_OutgoingClaimSummary(
            msg.sender, 
            totalClaimedAmount,
            outgoingTranchesBalance
        );
    }

    function emitPool_IncomingTrancheUpdate(
        address returner,
        uint256 trancheIndex,
        uint256 amountAppliedToTranche,
        bool isNowComplete,
        bool wasOnTime
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_IncomingTrancheUpdate(
            msg.sender, 
            returner,
            trancheIndex,
            amountAppliedToTranche,
            isNowComplete,
            wasOnTime
        );
    }

    function emitPool_IncomingReturnSummary(
        uint256 totalReturnedAmount,
        uint256 lastCompletedIncomingTranche
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_IncomingReturnSummary(
            msg.sender, 
            totalReturnedAmount,
            lastCompletedIncomingTranche
        );
    }

    function emitPool_FundsFullyReturned(
        uint256 timestamp
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_FundsFullyReturned(msg.sender, timestamp); 
    }

    function emitPool_RwaMinted(
        address minter,
        uint256 rwaAmountMinted,
        uint256 holdAmountPaid,
        uint256 feePaid
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_RwaMinted(
            msg.sender, 
            minter,
            rwaAmountMinted,
            holdAmountPaid,
            feePaid
        );
    }

    function emitPool_TargetReached(
        uint256 outgoingTranchesBalance,
        uint256 floatingTimestampOffset
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_TargetReached(
            msg.sender, 
            outgoingTranchesBalance,
            floatingTimestampOffset
        );
    }

    function emitPool_RwaBurned(
        address burner,
        uint256 rwaAmountBurned,
        uint256 holdAmountReceived,
        uint256 bonusAmountReceived,
        uint256 holdFeePaid,
        uint256 bonusFeePaid
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_RwaBurned(
            msg.sender, 
            burner,
            rwaAmountBurned,
            holdAmountReceived,
            bonusAmountReceived,
            holdFeePaid,
            bonusFeePaid
        );
    }

    function emitPool_AwaitingRwaAmountUpdated(
        uint256 awaitingRwaAmount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_AwaitingRwaAmountUpdated(msg.sender, awaitingRwaAmount); 
    }

    function emitPool_AwaitingBonusAmountUpdated(
        uint256 awaitingBonusAmount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_AwaitingBonusAmountUpdated(msg.sender, awaitingBonusAmount); 
    }

    function emitPool_ReservesUpdated(
        uint256 realHoldReserve,
        uint256 virtualHoldReserve,
        uint256 virtualRwaReserve
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_ReservesUpdated(
            msg.sender, 
            realHoldReserve,
            virtualHoldReserve,
            virtualRwaReserve
        );
    }

    function emitPool_PausedStateChanged(
        bool isPaused
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_PausedStateChanged(msg.sender, isPaused); 
    }

    // Renamed from Pool_StaticConfigured to Pool_Deployed as per user's previous feedback and file state
    function emitPool_Deployed(
        bool bonusAfterCompletion,
        bool floatingOutTranchesTimestamps,
        address holdToken,
        address rwaToken,
        address _addressBook,
        uint256 tokenId,
        string memory entityId,
        string memory entityOwnerId,
        string memory entityOwnerType,
        address owner,
        uint256 expectedHoldAmount,
        uint256 expectedRwaAmount,
        uint256 expectedBonusAmount,
        uint256 rewardPercent,
        bool fixedSell,
        bool allowEntryBurn,
        uint256 entryPeriodStart,
        uint256 entryPeriodExpired,
        uint256 completionPeriodExpired,
        uint256 k,
        uint256 entryFeePercent,
        uint256 exitFeePercent,
        uint256[] memory outgoingTranches,
        uint256[] memory outgoingTranchTimestamps,
        uint256[] memory incomingTranches,
        uint256[] memory incomingTrancheExpired
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_Deployed(
            msg.sender, 
            bonusAfterCompletion,
            floatingOutTranchesTimestamps,
            holdToken,
            rwaToken,
            _addressBook,
            tokenId,
            entityId,
            entityOwnerId,
            entityOwnerType,
            owner,
            expectedHoldAmount,
            expectedRwaAmount,
            expectedBonusAmount,
            rewardPercent,
            fixedSell,
            allowEntryBurn,
            entryPeriodStart,
            entryPeriodExpired,
            completionPeriodExpired,
            k,
            entryFeePercent,
            exitFeePercent,
            outgoingTranches,
            outgoingTranchTimestamps,
            incomingTranches,
            incomingTrancheExpired
        );
    }

    // --- Pool Events End ---


    function _authorizeUpgrade(address) internal view override { // Renamed from internal to internal view
        addressBook.requireGovernance(msg.sender);
    }


    event RWA_Transfer(
        address indexed emittedFrom, 
        address indexed from,
        address indexed to,
        uint256 tokenId,
        uint256 amount
    );

    event RWA_Deployed(
        address indexed emittedFrom, 
        address owner,
        string entityId
    );

    function emitRWA_Transfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount
    ) external {
        addressBook.requireProtocolContract(msg.sender); // Ensure caller is a registered RWA contract
        emit RWA_Transfer(msg.sender, from, to, tokenId, amount);
    }


    function emitRWA_Deployed( 
        address owner,
        string memory entityId
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit RWA_Deployed(msg.sender, owner, entityId);
    }
}
