// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "./AddressBook.sol";

/// @title Configuration contract for RWA protocol
/// @notice Stores all configurable parameters for the protocol
/// @dev Upgradeable contract using UUPS proxy pattern
contract Config is UpgradeableContract {
    /// @notice Address book contract reference
    AddressBook public addressBook;
    
    /// @notice Base URI for token metadata
    string public baseMetadataUri;

    /// @notice Token used for holding
    IERC20 public holdToken;

    /// @notice Minimum number of signers required for operations
    uint256 public minSignersRequired;

    /// @notice Fee range for creating RWA (in HOLD tokens)
    uint256 public createRWAFeeMin;
    uint256 public createRWAFeeMax;

    /// @notice Fee ratio range for creating pool (in basis points, max 10000 = 100%)
    uint256 public createPoolFeeRatioMin;
    uint256 public createPoolFeeRatioMax;

    /// @notice Expected HOLD amount range
    uint256 public expectedHoldAmountMin;
    uint256 public expectedHoldAmountMax;

    /// @notice Expected RWA amount range
    uint256 public expectedRwaAmountMin;
    uint256 public expectedRwaAmountMax;

    /// @notice Entry fee percentage range (in basis points, max 10000 = 100%)
    uint256 public entryFeePercentMin;
    uint256 public entryFeePercentMax;

    /// @notice Exit fee percentage range (in basis points, max 10000 = 100%)
    uint256 public exitFeePercentMin;
    uint256 public exitFeePercentMax;

    /// @notice Reward percentage range (in basis points)
    uint256 public rewardPercentMin;
    uint256 public rewardPercentMax;

    // --- Period Configuration ---
    /// @notice Minimum duration for entry period (between start and expired)
    uint256 public entryPeriodMinDuration;
    
    /// @notice Maximum duration for entry period (between start and expired)
    uint256 public entryPeriodMaxDuration;

    /// @notice Minimum duration for completion period (between entry expired and completion expired)
    uint256 public completionPeriodMinDuration;
    
    /// @notice Maximum duration for completion period (between entry expired and completion expired)
    uint256 public completionPeriodMaxDuration;

    /// @notice Maximum past offset for entry period start (e.g. 1 days for yesterday)
    uint256 public maxEntryStartPastOffset;
    
    /// @notice Maximum future offset for entry period start (e.g. 180 days for 6 months)
    uint256 public maxEntryStartFutureOffset;

    // --- Tranche Configuration ---
    /// @notice Configuration for outgoing tranches
    uint256 public outgoingTranchesMinCount;
    uint256 public outgoingTranchesMaxCount;
    uint256 public outgoingTranchesMinPercent;
    uint256 public outgoingTranchesMaxPercent;
    uint256 public outgoingTranchesMinInterval;

    /// @notice Configuration for incoming tranches
    uint256 public incomingTranchesMinCount;
    uint256 public incomingTranchesMaxCount;
    uint256 public incomingTranchesMinPercent;
    uint256 public incomingTranchesMaxPercent;
    uint256 public incomingTranchesMinInterval;

    // --- DAO Governance Configuration ---
    /// @notice Voting period duration in seconds
    uint256 public votingPeriod;
    
    /// @notice Minimum voting delay before proposal can be executed (in seconds)
    uint256 public votingDelay;
    
    /// @notice Quorum percentage required for proposal to pass (in basis points)
    uint256 public quorumPercentage;
    
    /// @notice Proposal threshold - minimum tokens needed to create proposal
    uint256 public proposalThreshold;
    
    /// @notice Timelock delay for executing proposals (in seconds)
    uint256 public timelockDelay;

    // --- DAO Staking Configuration ---
    /// @notice Annual reward rate for DAO staking (in basis points, max 10000 = 100%)
    uint256 public daoStakingAnnualRewardRate;

    // --- Liquidity Coefficient Configuration ---
    /// @notice Mapping of price impact percentage (multiplied by 100) to liquidity coefficient
    /// @dev Example: 1 => 13334 means 0.01% => 13334
    mapping(uint256 => uint256) public liquidityCoefficients;

    /// @notice Constructor that disables initializers
    constructor() UpgradeableContract() {}

    function initialize(
        address initialAddressBook,
        string memory initialBaseMetadataUri,
        address initialHoldToken,
        uint256 initialMinSignersRequired,
        uint256 initialCreateRWAFeeMin,
        uint256 initialCreateRWAFeeMax,
        uint256 initialCreatePoolFeeRatioMin,
        uint256 initialCreatePoolFeeRatioMax,
        uint256 initialExpectedHoldAmountMin,
        uint256 initialExpectedHoldAmountMax,
        uint256 initialExpectedRwaAmountMin,
        uint256 initialExpectedRwaAmountMax,
        uint256 initialEntryFeePercentMin,
        uint256 initialEntryFeePercentMax,
        uint256 initialExitFeePercentMin,
        uint256 initialExitFeePercentMax,
        uint256 initialRewardPercentMin,
        uint256 initialRewardPercentMax,
        uint256 initialEntryPeriodMinDuration,
        uint256 initialEntryPeriodMaxDuration,
        uint256 initialCompletionPeriodMinDuration,
        uint256 initialCompletionPeriodMaxDuration,
        uint256 initialMaxEntryStartPastOffset,
        uint256 initialMaxEntryStartFutureOffset,
        uint256 initialOutgoingTranchesMinCount,
        uint256 initialOutgoingTranchesMaxCount,
        uint256 initialOutgoingTranchesMinPercent,
        uint256 initialOutgoingTranchesMaxPercent,
        uint256 initialOutgoingTranchesMinInterval,
        uint256 initialIncomingTranchesMinCount,
        uint256 initialIncomingTranchesMaxCount,
        uint256 initialIncomingTranchesMinPercent,
        uint256 initialIncomingTranchesMaxPercent,
        uint256 initialIncomingTranchesMinInterval,
        uint256 initialVotingPeriod,
        uint256 initialVotingDelay,
        uint256 initialQuorumPercentage,
        uint256 initialProposalThreshold,
        uint256 initialTimelockDelay,
        uint256 initialDaoStakingAnnualRewardRate,
        uint256[] memory initialPriceImpactPercentages,
        uint256[] memory initialCoefficients
    ) external initializer {
        __UpgradeableContract_init();

        require(initialAddressBook != address(0), "Invalid address book");
        require(initialHoldToken != address(0), "Invalid hold token");
        require(initialMinSignersRequired > 0, "Invalid min signers required");
        require(initialCreateRWAFeeMin < initialCreateRWAFeeMax, "Invalid RWA fee range");
        require(initialCreatePoolFeeRatioMin < initialCreatePoolFeeRatioMax, "Invalid pool fee ratio range");
        require(initialCreatePoolFeeRatioMax <= 10000, "Pool fee ratio too high"); // Max 100%

        // Validate amount ranges
        require(initialExpectedHoldAmountMin < initialExpectedHoldAmountMax, "Invalid expected HOLD range");
        require(initialExpectedRwaAmountMin < initialExpectedRwaAmountMax, "Invalid expected RWA range");
        require(initialEntryFeePercentMax <= 10000, "Entry fee too high"); // Max 100%
        require(initialExitFeePercentMax <= 10000, "Exit fee too high"); // Max 100%
        require(initialRewardPercentMin < initialRewardPercentMax, "Invalid reward range");

        // Validate period durations
        require(initialEntryPeriodMinDuration > 0, "Invalid entry period min duration");
        require(initialEntryPeriodMaxDuration > initialEntryPeriodMinDuration, "Invalid entry period max duration");
        require(initialCompletionPeriodMinDuration > 0, "Invalid completion period min duration");
        require(initialCompletionPeriodMaxDuration > initialCompletionPeriodMinDuration, "Invalid completion period max duration");

        // Validate entry period offsets
        require(initialMaxEntryStartPastOffset > 0, "Invalid past offset");
        require(initialMaxEntryStartFutureOffset > initialMaxEntryStartPastOffset, "Invalid future offset");

        // Validate tranche configs
        require(initialOutgoingTranchesMinCount > 0 && initialOutgoingTranchesMaxCount >= initialOutgoingTranchesMinCount, "Invalid outgoing count range");
        require(initialOutgoingTranchesMinPercent > 0 && initialOutgoingTranchesMaxPercent <= 10000, "Invalid outgoing percent range");
        require(initialOutgoingTranchesMinInterval > 0, "Invalid outgoing interval");

        require(initialIncomingTranchesMinCount > 0 && initialIncomingTranchesMaxCount >= initialIncomingTranchesMinCount, "Invalid incoming count range");
        require(initialIncomingTranchesMinPercent > 0 && initialIncomingTranchesMaxPercent <= 10000, "Invalid incoming percent range");
        require(initialIncomingTranchesMinInterval > 0, "Invalid incoming interval");

        addressBook = AddressBook(initialAddressBook);
        baseMetadataUri = initialBaseMetadataUri;
        holdToken = IERC20(initialHoldToken);
        minSignersRequired = initialMinSignersRequired;

        createRWAFeeMin = initialCreateRWAFeeMin;
        createRWAFeeMax = initialCreateRWAFeeMax;
        createPoolFeeRatioMin = initialCreatePoolFeeRatioMin;
        createPoolFeeRatioMax = initialCreatePoolFeeRatioMax;

        expectedHoldAmountMin = initialExpectedHoldAmountMin;
        expectedHoldAmountMax = initialExpectedHoldAmountMax;
        expectedRwaAmountMin = initialExpectedRwaAmountMin;
        expectedRwaAmountMax = initialExpectedRwaAmountMax;

        entryFeePercentMin = initialEntryFeePercentMin;
        entryFeePercentMax = initialEntryFeePercentMax;
        exitFeePercentMin = initialExitFeePercentMin;
        exitFeePercentMax = initialExitFeePercentMax;

        rewardPercentMin = initialRewardPercentMin;
        rewardPercentMax = initialRewardPercentMax;

        entryPeriodMinDuration = initialEntryPeriodMinDuration;
        entryPeriodMaxDuration = initialEntryPeriodMaxDuration;
        completionPeriodMinDuration = initialCompletionPeriodMinDuration;
        completionPeriodMaxDuration = initialCompletionPeriodMaxDuration;
        maxEntryStartPastOffset = initialMaxEntryStartPastOffset;
        maxEntryStartFutureOffset = initialMaxEntryStartFutureOffset;

        outgoingTranchesMinCount = initialOutgoingTranchesMinCount;
        outgoingTranchesMaxCount = initialOutgoingTranchesMaxCount;
        outgoingTranchesMinPercent = initialOutgoingTranchesMinPercent;
        outgoingTranchesMaxPercent = initialOutgoingTranchesMaxPercent;
        outgoingTranchesMinInterval = initialOutgoingTranchesMinInterval;

        incomingTranchesMinCount = initialIncomingTranchesMinCount;
        incomingTranchesMaxCount = initialIncomingTranchesMaxCount;
        incomingTranchesMinPercent = initialIncomingTranchesMinPercent;
        incomingTranchesMaxPercent = initialIncomingTranchesMaxPercent;
        incomingTranchesMinInterval = initialIncomingTranchesMinInterval;

        // Set DAO governance parameters
        votingPeriod = initialVotingPeriod;
        votingDelay = initialVotingDelay;
        quorumPercentage = initialQuorumPercentage;
        proposalThreshold = initialProposalThreshold;
        timelockDelay = initialTimelockDelay;
        
        // Set DAO staking parameters
        require(initialDaoStakingAnnualRewardRate <= 10000, "Invalid reward rate"); // Max 100%
        daoStakingAnnualRewardRate = initialDaoStakingAnnualRewardRate;

        // Set initial liquidity coefficients
        require(initialPriceImpactPercentages.length == initialCoefficients.length, "Arrays length mismatch");
        require(initialPriceImpactPercentages.length > 0, "Empty arrays");

        for (uint256 i = 0; i < initialPriceImpactPercentages.length; i++) {
            require(initialCoefficients[i] > 0, "Invalid coefficient");
            liquidityCoefficients[initialPriceImpactPercentages[i]] = initialCoefficients[i];
        }
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("Config");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireUpgradeRole(msg.sender);
    }

    /// @notice Updates base metadata URI
    /// @param newBaseMetadataUri New base URI for metadata
    function updateBaseMetadataUri(string memory newBaseMetadataUri) external {
        addressBook.requireGovernance(msg.sender);
        baseMetadataUri = newBaseMetadataUri;
    }

    /// @notice Updates hold token address
    /// @param newHoldToken New hold token address
    function updateHoldToken(address newHoldToken) external {
        addressBook.requireGovernance(msg.sender);
        require(newHoldToken != address(0), "Invalid hold token");
        holdToken = IERC20(newHoldToken);
    }

    /// @notice Updates minimum required number of signers
    /// @param newMinSignersRequired New minimum number of signers required
    function updateMinSignersRequired(uint256 newMinSignersRequired) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinSignersRequired > 0, "Invalid min signers");
        minSignersRequired = newMinSignersRequired;
    }

    /// @notice Updates RWA creation fee range
    /// @param newMin New minimum fee
    /// @param newMax New maximum fee
    function updateCreateRWAFeeRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        
        require(newMin < newMax, "Invalid RWA fee range");
        require(newMax <= 10000, "Fee too high"); 
        
        createRWAFeeMin = newMin;
        createRWAFeeMax = newMax;
    }

    /// @notice Updates pool creation fee ratio range
    /// @param newMin New minimum ratio
    /// @param newMax New maximum ratio
    function updateCreatePoolFeeRatioRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        require(newMin < newMax, "Invalid pool fee ratio range");
        require(newMax <= 10000, "Pool fee ratio too high"); // Max 100%
        createPoolFeeRatioMin = newMin;
        createPoolFeeRatioMax = newMax;
    }

    /// @notice Updates expected HOLD amount range
    /// @param newMin New minimum amount
    /// @param newMax New maximum amount
    function updateExpectedHoldAmountRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        require(newMin < newMax, "Invalid HOLD range");
        expectedHoldAmountMin = newMin;
        expectedHoldAmountMax = newMax;
    }

    /// @notice Updates expected RWA amount range
    /// @param newMin New minimum amount
    /// @param newMax New maximum amount
    function updateExpectedRwaAmountRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        require(newMin < newMax, "Invalid RWA range");
        expectedRwaAmountMin = newMin;
        expectedRwaAmountMax = newMax;
    }

    /// @notice Updates entry fee percentage range
    /// @param newMin New minimum percentage
    /// @param newMax New maximum percentage
    function updateEntryFeePercentRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        require(newMin < newMax, "Invalid entry fee range");
        require(newMax <= 10000, "Entry fee too high");
        entryFeePercentMin = newMin;
        entryFeePercentMax = newMax;
    }

    /// @notice Updates exit fee percentage range
    /// @param newMin New minimum percentage
    /// @param newMax New maximum percentage
    function updateExitFeePercentRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        require(newMin < newMax, "Invalid exit fee range");
        require(newMax <= 10000, "Exit fee too high");
        exitFeePercentMin = newMin;
        exitFeePercentMax = newMax;
    }

    /// @notice Updates reward percentage range
    /// @param newMin New minimum percentage
    /// @param newMax New maximum percentage
    function updateRewardPercentRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        require(newMin < newMax, "Invalid reward range");
        require(newMax <= 10000, "Reward too high");
        rewardPercentMin = newMin;
        rewardPercentMax = newMax;
    }

    /// @notice Updates entry period configuration
    /// @param newMaxPastOffset New maximum past offset for entry start
    /// @param newMaxFutureOffset New maximum future offset for entry start
    function updateEntryPeriodConfig(uint256 newMaxPastOffset, uint256 newMaxFutureOffset) external {
        addressBook.requireGovernance(msg.sender);
        require(newMaxPastOffset > 0, "Invalid past offset");
        require(newMaxFutureOffset > newMaxPastOffset, "Invalid future offset");
        maxEntryStartPastOffset = newMaxPastOffset;
        maxEntryStartFutureOffset = newMaxFutureOffset;
    }

    /// @notice Updates entry period duration range
    /// @param newMin New minimum duration
    /// @param newMax New maximum duration
    function updateEntryPeriodDurationRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        require(newMin > 0, "Invalid entry period min duration");
        require(newMax > newMin, "Invalid entry period max duration");
        entryPeriodMinDuration = newMin;
        entryPeriodMaxDuration = newMax;
    }

    /// @notice Updates completion period duration range
    /// @param newMin New minimum duration
    /// @param newMax New maximum duration
    function updateCompletionPeriodDurationRange(uint256 newMin, uint256 newMax) external {
        addressBook.requireGovernance(msg.sender);
        require(newMin > 0, "Invalid completion period min duration");
        require(newMax > newMin, "Invalid completion period max duration");
        completionPeriodMinDuration = newMin;
        completionPeriodMaxDuration = newMax;
    }

    /// @notice Updates outgoing tranches configuration
    function updateOutgoingTranchesConfig(
        uint256 newMinCount,
        uint256 newMaxCount,
        uint256 newMinPercent,
        uint256 newMaxPercent,
        uint256 newMinInterval
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinCount > 0 && newMaxCount >= newMinCount, "Invalid count range");
        require(newMinPercent > 0 && newMinPercent < newMaxPercent, "Invalid percent range");
        require(newMaxPercent <= 10000, "Invalid percent range");
        require(newMinInterval > 0, "Invalid interval");

        outgoingTranchesMinCount = newMinCount;
        outgoingTranchesMaxCount = newMaxCount;
        outgoingTranchesMinPercent = newMinPercent;
        outgoingTranchesMaxPercent = newMaxPercent;
        outgoingTranchesMinInterval = newMinInterval;
    }

    /// @notice Updates incoming tranches configuration
    function updateIncomingTranchesConfig(
        uint256 newMinCount,
        uint256 newMaxCount,
        uint256 newMinPercent,
        uint256 newMaxPercent,
        uint256 newMinInterval
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinCount > 0 && newMaxCount >= newMinCount, "Invalid count range");
        require(newMinPercent > 0 && newMinPercent < newMaxPercent, "Invalid percent range");
        require(newMaxPercent <= 10000, "Invalid percent range");
        require(newMinInterval > 0, "Invalid interval");

        incomingTranchesMinCount = newMinCount;
        incomingTranchesMaxCount = newMaxCount;
        incomingTranchesMinPercent = newMinPercent;
        incomingTranchesMaxPercent = newMaxPercent;
        incomingTranchesMinInterval = newMinInterval;
    }

    /// @notice Updates liquidity coefficients mapping
    /// @param percentages Array of price impact percentages (multiplied by 100)
    /// @param coefficients Array of corresponding liquidity coefficients
    function updateLiquidityCoefficients(
        uint256[] memory percentages,
        uint256[] memory coefficients
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(percentages.length == coefficients.length, "Arrays length mismatch");
        require(percentages.length > 0, "Empty arrays");

        // Set new coefficients
        for (uint256 i = 0; i < percentages.length; i++) {
            require(coefficients[i] > 0, "Invalid coefficient");
            liquidityCoefficients[percentages[i]] = coefficients[i];
        }
    }

    /// @notice Updates DAO governance voting period
    /// @param newVotingPeriod New voting period in seconds
    function updateVotingPeriod(uint256 newVotingPeriod) external {
        addressBook.requireGovernance(msg.sender);
        require(newVotingPeriod > 0, "Invalid voting period");
        votingPeriod = newVotingPeriod;
    }

    /// @notice Updates DAO governance voting delay
    /// @param newVotingDelay New voting delay in seconds
    function updateVotingDelay(uint256 newVotingDelay) external {
        addressBook.requireGovernance(msg.sender);
        votingDelay = newVotingDelay;
    }

    /// @notice Updates DAO governance quorum percentage
    /// @param newQuorumPercentage New quorum percentage in basis points
    function updateQuorumPercentage(uint256 newQuorumPercentage) external {
        addressBook.requireGovernance(msg.sender);
        require(newQuorumPercentage > 0 && newQuorumPercentage <= 10000, "Invalid quorum percentage");
        quorumPercentage = newQuorumPercentage;
    }

    /// @notice Updates DAO governance proposal threshold
    /// @param newProposalThreshold New proposal threshold amount
    function updateProposalThreshold(uint256 newProposalThreshold) external {
        addressBook.requireGovernance(msg.sender);
        require(newProposalThreshold > 0, "Invalid proposal threshold");
        proposalThreshold = newProposalThreshold;
    }

    /// @notice Updates DAO timelock delay
    /// @param newTimelockDelay New timelock delay in seconds
    function updateTimelockDelay(uint256 newTimelockDelay) external {
        addressBook.requireGovernance(msg.sender);
        require(newTimelockDelay > 0, "Invalid timelock delay");
        timelockDelay = newTimelockDelay;
    }

    /// @notice Updates DAO staking annual reward rate
    /// @param newRewardRate New annual reward rate in basis points
    function updateDaoStakingAnnualRewardRate(uint256 newRewardRate) external {
        addressBook.requireGovernance(msg.sender);
        require(newRewardRate <= 10000, "Invalid reward rate"); // Max 100%
        daoStakingAnnualRewardRate = newRewardRate;
    }

    /// @notice Gets liquidity coefficient for a given price impact percentage
    /// @param percentage Price impact percentage (multiplied by 100)
    /// @return coefficient Corresponding liquidity coefficient
    function getLiquidityCoefficient(uint256 percentage) external view returns (uint256 coefficient) {
        coefficient = liquidityCoefficients[percentage];
        require(coefficient > 0, "Coefficient not found");
        return coefficient;
    }
}
