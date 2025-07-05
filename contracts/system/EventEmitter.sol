// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "./AddressBook.sol";

contract EventEmitter is UpgradeableContract {
    /// @notice Address book contract reference
    AddressBook public addressBook;
    
    uint256 public genesisBlock;

    constructor() UpgradeableContract() {}

    function initialize(address initialAddressBook) external initializer {
        __UpgradeableContract_init();

        require(initialAddressBook != address(0), "Invalid address book");
        addressBook = AddressBook(initialAddressBook);
        genesisBlock = block.number;
    }

    // --- Pool Events Start ---

    event Pool_OutgoingTrancheClaimed(
        address indexed emittedFrom,
        address indexed claimer,
        uint256 trancheIndex,
        uint256 amountClaimed,
        address holdToken
    );

    event Pool_OutgoingClaimSummary(
        address indexed emittedFrom,
        uint256 currentTotalClaimedAmount,
        uint256 currentOutgoingTranchesBalance
    );

    event Pool_IncomingTrancheUpdate(
        address indexed emittedFrom,
        address indexed caller,
        address owner,
        uint256 trancheIndex,
        uint256 amountAppliedToTranche,
        bool isNowComplete,
        bool wasOnTime,
        address holdToken
    );

    event Pool_IncomingReturnSummary(
        address indexed emittedFrom,
        uint256 currentTotalReturnedAmount,
        uint256 currentAwaitingBonusAmount,
        uint256 currentLastCompletedIncomingTranche
    );

    event Pool_BonusWithdrawn(
        address indexed emittedFrom,
        uint256 currentAwaitingBonusAmount,
        uint256 currentRewardedRwaAmount
    );

    event Pool_FundsFullyReturned(
        address indexed emittedFrom,
        address indexed caller,
        address owner,
        uint256 timestamp
    );

    event Pool_RwaMinted(
        address indexed emittedFrom,
        address indexed minter,
        uint256 rwaAmountMinted,
        uint256 holdAmountPaid,
        uint256 feePaid,
        uint256 percentBefore,
        uint256 userPercent,
        bool targetReached,
        string businessId,
        string poolId,
        address holdToken
    );

    event Pool_TargetReached(
        address indexed emittedFrom,
        uint256 outgoingTranchesBalance,
        uint256 floatingTimestampOffset,
        address owner
    );

    event Pool_RwaBurned(
        address indexed emittedFrom,
        address indexed burner,
        uint256 rwaAmountBurned,
        uint256 holdAmountReceived,
        uint256 bonusAmountReceived,
        uint256 holdFeePaid,
        uint256 bonusFeePaid,
        uint256 percentBefore,
        uint256 userPercent,
        bool targetReached,
        string businessId,
        string poolId,
        address holdToken
    );

    event Pool_AwaitingRwaAmountUpdated(
        address indexed emittedFrom, 
        uint256 awaitingRwaAmount
    );

    event Pool_ReservesUpdated(
        address indexed emittedFrom, 
        uint256 realHoldReserve,
        uint256 virtualHoldReserve,
        uint256 virtualRwaReserve
    );

    event Pool_PausedStateChanged(
        address indexed emittedFrom, 
        bool isPaused
    );

    event Pool_Deployed(
        address indexed emittedFrom,
        address indexed deployer,
        bool awaitCompletionExpired,
        bool floatingOutTranchesTimestamps,
        address holdToken,
        address rwaToken,
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
        uint256 amountClaimed,
        address holdToken
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_OutgoingTrancheClaimed(
            msg.sender,
            claimer,
            trancheIndex,
            amountClaimed,
            holdToken
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
        address caller,
        address owner,
        uint256 trancheIndex,
        uint256 amountAppliedToTranche,
        bool isNowComplete,
        bool wasOnTime,
        address holdToken
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_IncomingTrancheUpdate(
            msg.sender,
            caller,
            owner,
            trancheIndex,
            amountAppliedToTranche,
            isNowComplete,
            wasOnTime,
            holdToken
        );
    }

    function emitPool_IncomingReturnSummary(
        uint256 totalAmountAppliedInCall,
        uint256 totalAppliedToBonusInCall,
        uint256 lastCompletedIncomingTranche
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_IncomingReturnSummary(
            msg.sender,
            totalAmountAppliedInCall,
            totalAppliedToBonusInCall,
            lastCompletedIncomingTranche
        );
    }

    function emitPool_BonusWithdrawn(
        uint256 bonusAmountWithdrawn,
        uint256 eligibleRwaAmount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_BonusWithdrawn(
            msg.sender,
            bonusAmountWithdrawn,
            eligibleRwaAmount
        );
    }

    function emitPool_FundsFullyReturned(
        address caller,
        address owner,
        uint256 timestamp
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_FundsFullyReturned(msg.sender, caller, owner, timestamp);
    }

    function emitPool_RwaMinted(
        address minter,
        uint256 rwaAmountMinted,
        uint256 holdAmountPaid,
        uint256 feePaid,
        uint256 percentBefore,
        uint256 userPercent,
        bool targetReached,
        string memory businessId,
        string memory poolId,
        address holdToken
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_RwaMinted(
            msg.sender,
            minter,
            rwaAmountMinted,
            holdAmountPaid,
            feePaid,
            percentBefore,
            userPercent,
            targetReached,
            businessId,
            poolId,
            holdToken
        );
    }

    function emitPool_TargetReached(
        uint256 outgoingTranchesBalance,
        uint256 floatingTimestampOffset,
        address owner
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_TargetReached(
            msg.sender,
            outgoingTranchesBalance,
            floatingTimestampOffset,
            owner
        );
    }

    function emitPool_RwaBurned(
        address burner,
        uint256 rwaAmountBurned,
        uint256 holdAmountReceived,
        uint256 bonusAmountReceived,
        uint256 holdFeePaid,
        uint256 bonusFeePaid,
        uint256 percentBefore,
        uint256 userPercent,
        bool targetReached,
        string memory businessId,
        string memory poolId,
        address holdToken
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_RwaBurned(
            msg.sender,
            burner,
            rwaAmountBurned,
            holdAmountReceived,
            bonusAmountReceived,
            holdFeePaid,
            bonusFeePaid,
            percentBefore,
            userPercent,
            targetReached,
            businessId,
            poolId,
            holdToken
        );
    }

    function emitPool_AwaitingRwaAmountUpdated(
        uint256 awaitingRwaAmount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_AwaitingRwaAmountUpdated(msg.sender, awaitingRwaAmount); 
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
        address deployer,
        bool awaitCompletionExpired,
        bool floatingOutTranchesTimestamps,
        address holdToken,
        address rwaToken,
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
            deployer,
            awaitCompletionExpired,
            floatingOutTranchesTimestamps,
            holdToken,
            rwaToken,
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

    // --- DAO Events Start ---

    event DAO_ProposalCreated(
        address indexed emittedFrom,
        uint256 indexed proposalId,
        address indexed proposer,
        address target,
        bytes data,
        string description,
        uint256 startTime,
        uint256 endTime
    );

    event DAO_VoteCast(
        address indexed emittedFrom,
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight,
        string reason
    );

    event DAO_ProposalExecuted(
        address indexed emittedFrom,
        uint256 indexed proposalId,
        address indexed executor
    );

    event DAO_ProposalCancelled(
        address indexed emittedFrom,
        uint256 indexed proposalId,
        address indexed canceller
    );

    event DAO_TokensStaked(
        address indexed emittedFrom,
        address indexed staker,
        uint256 amount,
        uint256 newVotingPower
    );

    event DAO_TokensUnstaked(
        address indexed emittedFrom,
        address indexed staker,
        uint256 amount,
        uint256 newVotingPower
    );

    event DAO_TransactionQueued(
        address indexed emittedFrom,
        bytes32 indexed txHash,
        address target,
        bytes data,
        uint256 eta
    );

    event DAO_TransactionExecuted(
        address indexed emittedFrom,
        bytes32 indexed txHash,
        address target,
        bytes data,
        uint256 eta
    );

    event DAO_TransactionCancelled(
        address indexed emittedFrom,
        bytes32 indexed txHash,
        address target,
        bytes data,
        uint256 eta
    );

    event DAO_TreasuryWithdrawal(
        address indexed emittedFrom,
        address indexed to,
        address indexed token,
        uint256 amount
    );

    // --- DAO Emitter Functions Start ---

    function emitDAO_ProposalCreated(
        uint256 proposalId,
        address proposer,
        address target,
        bytes memory data,
        string memory description,
        uint256 startTime,
        uint256 endTime
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_ProposalCreated(
            msg.sender,
            proposalId,
            proposer,
            target,
            data,
            description,
            startTime,
            endTime
        );
    }

    function emitDAO_VoteCast(
        uint256 proposalId,
        address voter,
        bool support,
        uint256 weight,
        string memory reason
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_VoteCast(
            msg.sender,
            proposalId,
            voter,
            support,
            weight,
            reason
        );
    }

    function emitDAO_ProposalExecuted(
        uint256 proposalId,
        address executor
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_ProposalExecuted(msg.sender, proposalId, executor);
    }

    function emitDAO_ProposalCancelled(
        uint256 proposalId,
        address canceller
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_ProposalCancelled(msg.sender, proposalId, canceller);
    }

    function emitDAO_TokensStaked(
        address staker,
        uint256 amount,
        uint256 newVotingPower
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_TokensStaked(msg.sender, staker, amount, newVotingPower);
    }

    function emitDAO_TokensUnstaked(
        address staker,
        uint256 amount,
        uint256 newVotingPower
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_TokensUnstaked(msg.sender, staker, amount, newVotingPower);
    }

    function emitDAO_TransactionQueued(
        bytes32 txHash,
        address target,
        bytes memory data,
        uint256 eta
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_TransactionQueued(msg.sender, txHash, target, data, eta);
    }

    function emitDAO_TransactionExecuted(
        bytes32 txHash,
        address target,
        bytes memory data,
        uint256 eta
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_TransactionExecuted(msg.sender, txHash, target, data, eta);
    }

    function emitDAO_TransactionCancelled(
        bytes32 txHash,
        address target,
        bytes memory data,
        uint256 eta
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_TransactionCancelled(msg.sender, txHash, target, data, eta);
    }

    function emitDAO_TreasuryWithdrawal(
        address to,
        address token,
        uint256 amount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DAO_TreasuryWithdrawal(msg.sender, to, token, amount);
    }

    // --- DAO Events End ---

    // --- ReferralTreasury Events Start ---

    event ReferralTreasury_Withdrawn(
        address indexed emittedFrom,
        address indexed user,
        address indexed token,
        uint256 amount
    );

    event ReferralTreasury_EmergencyWithdrawn(
        address indexed emittedFrom,
        address indexed to,
        address indexed token,
        uint256 amount,
        address caller
    );

    // --- ReferralTreasury Emitter Functions Start ---

    function emitReferralTreasury_Withdrawn(
        address user,
        address token,
        uint256 amount
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit ReferralTreasury_Withdrawn(msg.sender, user, token, amount);
    }

    function emitReferralTreasury_EmergencyWithdrawn(
        address to,
        address token,
        uint256 amount,
        address caller
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit ReferralTreasury_EmergencyWithdrawn(msg.sender, to, token, amount, caller);
    }

    // --- ReferralTreasury Events End ---

    // --- Factory Events Start ---

    event Factory_CreateRWAFeeCollected(
        address indexed emittedFrom,
        address indexed sender,
        uint256 amount,
        address token
    );

    event Factory_CreatePoolFeeCollected(
        address indexed emittedFrom,
        address indexed sender,
        uint256 amount,
        address token
    );

    // --- Factory Emitter Functions Start ---

    function emitFactory_CreateRWAFeeCollected(
        address sender,
        uint256 amount,
        address token
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Factory_CreateRWAFeeCollected(msg.sender, sender, amount, token);
    }

    function emitFactory_CreatePoolFeeCollected(
        address sender,
        uint256 amount,
        address token
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Factory_CreatePoolFeeCollected(msg.sender, sender, amount, token);
    }

    // --- Factory Events End ---


    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("EventEmitter");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireTimelock(msg.sender);
    }


    event RWA_PausedStateChanged(
        address indexed emittedFrom,
        bool isPaused
    );

    event RWA_Transfer(
        address indexed emittedFrom, 
        address indexed from,
        address indexed to,
        uint256 tokenId,
        uint256 amount,
        address pool
    );

    event RWA_Deployed(
        address indexed emittedFrom,
        address indexed deployer,
        address owner,
        string entityId
    );

    function emitRWA_Transfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        address pool
    ) external {
        addressBook.requireProtocolContract(msg.sender); // Ensure caller is a registered RWA contract
        emit RWA_Transfer(msg.sender, from, to, tokenId, amount, pool);
    }


    function emitRWA_PausedStateChanged(
        bool isPaused
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit RWA_PausedStateChanged(msg.sender, isPaused);
    }

    function emitRWA_Deployed(
        address deployer,
        address owner,
        string memory entityId
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit RWA_Deployed(msg.sender, deployer, owner, entityId);
    }
}
