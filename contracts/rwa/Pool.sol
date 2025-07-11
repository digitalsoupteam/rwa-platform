// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RWA } from "./RWA.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { AddressBook } from "../system/AddressBook.sol";
import { Config } from "../system/Config.sol";
import { EventEmitter } from "../system/EventEmitter.sol";
import { UpgradeableContract } from "../utils/UpgradeableContract.sol";

contract Pool is UpgradeableContract, ReentrancyGuardUpgradeable {
    // --- Static Configuration Parameters ---
    // Variables set during initialization and then immutable.

    /// @notice Price impact percent used for AMM calculations
    /// @dev Set during initialization and then immutable.
    uint256 public priceImpactPercent;

    /// @notice Liquidity coefficient used for AMM calculations
    /// @dev Set during initialization and then immutable.
    uint256 public liquidityCoefficient;

    /// @notice HOLD token contract
    /// @dev Set during initialization and then immutable.
    IERC20 public holdToken;

    /// @notice RWA token contract
    /// @dev Set during initialization and then immutable.
    RWA public rwaToken;

    /// @notice Address book contract
    /// @dev Set during initialization and then immutable.
    AddressBook public addressBook;

    /// @notice RWA token ID used in this pool
    /// @dev Set during initialization and then immutable.
    uint256 public tokenId;

    /// @notice Entity ID in the database
    /// @dev Set during initialization and then immutable.
    string public entityId;

    /// @notice Parent entity ID in the database (RWA entity ID)
    /// @dev Set during initialization and then immutable.
    string public parentId;

    /// @notice Entity owner ID in the database
    /// @dev Set during initialization and then immutable.
    string public entityOwnerId;

    /// @notice Entity owner type in the database
    /// @dev Set during initialization and then immutable.
    string public entityOwnerType;

    /// @notice Owner address
    /// @dev Set during initialization and then immutable.
    address public owner;

    /// @notice Expected amount in HOLD tokens for program participation
    /// @dev Set during initialization and then immutable.
    uint256 public expectedHoldAmount;

    /// @notice Expected amount of RWA tokens for the program
    /// @dev Set during initialization and then immutable.
    uint256 public expectedRwaAmount;

    /// @notice Expected bonus amount in HOLD tokens
    /// @dev Set during initialization (calculated) and then immutable.
    uint256 public expectedBonusAmount;

    /// @notice Reward percentage for calculating bonus (in basis points)
    /// @dev Set during initialization and then immutable.
    uint256 public rewardPercent;

    /// @notice If true, bonuses are available after completionExpired. If false, after 1 day since full return
    /// @dev Set during initialization and then immutable.
    bool public awaitCompletionExpired;

    /// @notice If true, outgoing tranche timestamps will be adjusted if target is reached early
    /// @dev Set during initialization and then immutable.
    bool public floatingOutTranchesTimestamps;

    /// @notice Flag indicating if RWA amount is fixed
    /// @dev Set during initialization and then immutable.
    bool public fixedSell;

    /// @notice Flag indicating if burning is allowed during entry period
    /// @dev Set during initialization and then immutable.
    bool public allowEntryBurn;

    /// @notice Program entry period start timestamp
    /// @dev Set during initialization and then immutable.
    uint256 public entryPeriodStart;

    /// @notice Program entry period expiration timestamp
    /// @dev Set during initialization (derived) and then immutable.
    uint256 public entryPeriodExpired;

    /// @notice Program completion period expiration timestamp
    /// @dev Set during initialization (derived) and then immutable.
    uint256 public completionPeriodExpired;

    /// @notice Constant product for AMM calculations (k = virtualHoldReserve * virtualRwaReserve)
    /// @dev Set during initialization and then immutable.
    uint256 public k;

    /// @notice Fee percentage charged when entering the pool (in basis points)
    /// @dev Set during initialization and then immutable.
    uint256 public entryFeePercent;

    /// @notice Fee percentage charged when exiting the pool (in basis points)
    /// @dev Set during initialization and then immutable.
    uint256 public exitFeePercent;

    /// @notice Array of outgoing tranche amounts
    /// @dev Set during initialization and then immutable (content of array is fixed).
    uint256[] public outgoingTranches;

    /// @notice Array of outgoing tranche timestamps
    /// @dev Set during initialization and then immutable (content of array is fixed).
    uint256[] public outgoingTranchTimestamps;

    /// @notice Array of incoming tranche amounts
    /// @dev Set during initialization and then immutable (content of array is fixed).
    uint256[] public incomingTranches;

    /// @notice Array of incoming tranche expiration timestamps
    /// @dev Set during initialization and then immutable (content of array is fixed).
    uint256[] public incomingTrancheExpired;

    // --- Dynamic State Variables ---
    // Variables that change during the lifecycle of the pool.

    /// @notice Offset applied to outgoing tranche timestamps if target is reached early and floatingOutTranchesTimestamps is true
    uint256 public floatingTimestampOffset;

    /// @notice Emergency pause flag
    bool public paused;

    /// @notice Total amount of claimed HOLD tokens
    uint256 public totalClaimedAmount;

    /// @notice Total amount of returned HOLD tokens
    uint256 public totalReturnedAmount;

    /// @notice Amount of bonus HOLD tokens awaiting claim
    uint256 public awaitingBonusAmount;

    /// @notice Flag indicating if target amount has been reached
    bool public isTargetReached;

    /// @notice Flag indicating if full return has been completed
    bool public isFullyReturned;

    /// @notice Timestamp when funds were fully returned
    uint256 public fullReturnTimestamp;

    /// @notice Amount of RWA tokens awaiting return
    uint256 public awaitingRwaAmount;

    /// @notice Amount of HOLD tokens available for outgoing tranches
    uint256 public outgoingTranchesBalance;

    /// @notice Real amount of HOLD tokens in pool
    uint256 public realHoldReserve;

    /// @notice Virtual amount of HOLD tokens in pool
    uint256 public virtualHoldReserve;

    /// @notice Virtual amount of RWA tokens in pool
    uint256 public virtualRwaReserve;

    /// @notice Array tracking claimed amounts for each outgoing tranche
    uint256[] public outgoingTrancheStates;

    /// @notice Array tracking returned amounts for each incoming tranche
    uint256[] public incomingTrancheStates;

    /// @notice Index of the last fully completed incoming tranche
    uint256 public lastCompletedIncomingTranche;

    /// @notice Amount of rwa token received bonus
    uint256 public rewardedRwaAmount;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() UpgradeableContract() {}

    function initialize(
        address _deployer,
        address _holdToken,
        address _rwaToken,
        AddressBook _addressBook,
        uint256 _tokenId,
        string memory _entityId,
        string memory _entityOwnerId,
        string memory _entityOwnerType,
        address _owner,
        uint256 _expectedHoldAmount,
        uint256 _expectedRwaAmount,
        uint256 _priceImpactPercent,
        uint256 _liquidityCoefficient,
        uint256 _entryFeePercent,
        uint256 _exitFeePercent,
        uint256 _entryPeriodStart,
        uint256 _entryPeriodExpired,
        uint256 _completionPeriodExpired,
        uint256 _rewardPercent,
        uint256 _expectedBonusAmount,
        bool _fixedSell,
        bool _allowEntryBurn,
        bool _awaitCompletionExpired,
        bool _floatingOutTranchesTimestamps,
        uint256[] memory _outgoingTranches,
        uint256[] memory _outgoingTranchTimestamps,
        uint256[] memory _incomingTranches,
        uint256[] memory _incomingTrancheExpired
    ) external initializer {
        addressBook = _addressBook;
        
        // Get parent ID from RWA contract
        parentId = RWA(_rwaToken).entityId();

        __UpgradeableContract_init();
        __ReentrancyGuard_init_unchained();

        priceImpactPercent = _priceImpactPercent;
        liquidityCoefficient = _liquidityCoefficient;
        entryPeriodStart = _entryPeriodStart;
        entryPeriodExpired = _entryPeriodExpired;
        completionPeriodExpired = _completionPeriodExpired;
        holdToken = IERC20(_holdToken);
        rwaToken = RWA(_rwaToken);
        tokenId = _tokenId;
        entityId = _entityId;
        entityOwnerId = _entityOwnerId;
        entityOwnerType = _entityOwnerType;
        owner = _owner;
        expectedHoldAmount = _expectedHoldAmount;
        expectedRwaAmount = _expectedRwaAmount;
        rewardPercent = _rewardPercent;
        expectedBonusAmount = _expectedBonusAmount;

        // Initialize state
        isTargetReached = false;
        isFullyReturned = false;
        paused = false;
        fixedSell = _fixedSell;
        awaitCompletionExpired = _awaitCompletionExpired;
        floatingOutTranchesTimestamps = _floatingOutTranchesTimestamps;
        allowEntryBurn = _allowEntryBurn;
        awaitingRwaAmount = 0;
        floatingTimestampOffset = 0;
        rewardedRwaAmount = 0;

        // Initialize reserves using liquidity coefficient
        uint256 _virtualHoldReserve = _expectedHoldAmount * _liquidityCoefficient;
        uint256 _virtualRwaReserve = _expectedRwaAmount * (_liquidityCoefficient + 1);
        virtualHoldReserve = _virtualHoldReserve;
        virtualRwaReserve = _virtualRwaReserve;
        uint256 _realHoldReserve = 0;
        realHoldReserve = _realHoldReserve;
        outgoingTranchesBalance = 0;
        uint256 _k = _virtualHoldReserve * _virtualRwaReserve;
        k = _k;

        // Initialize fee percentages
        entryFeePercent = _entryFeePercent;
        exitFeePercent = _exitFeePercent;

        // Initialize tranches
        outgoingTranches = _outgoingTranches;
        outgoingTranchTimestamps = _outgoingTranchTimestamps;
        outgoingTrancheStates = new uint256[](_outgoingTranches.length);

        incomingTranches = _incomingTranches;
        incomingTrancheExpired = _incomingTrancheExpired;
        incomingTrancheStates = new uint256[](_incomingTranches.length);
        lastCompletedIncomingTranche = 0;

        // Initialize counters
        totalClaimedAmount = 0;
        totalReturnedAmount = 0;
        awaitingBonusAmount = 0;

        EventEmitter _eventEmitter = _addressBook.eventEmitter();

        _eventEmitter.emitPool_Deployed(
            _deployer,
            _awaitCompletionExpired,
            _floatingOutTranchesTimestamps,
            address(_holdToken),
            address(_rwaToken),
            _tokenId,
            _entityId,
            _entityOwnerId,
            _entityOwnerType,
            _owner,
            _expectedHoldAmount,
            _expectedRwaAmount,
            _expectedBonusAmount,
            _rewardPercent,
            _fixedSell,
            _allowEntryBurn,
            _entryPeriodStart,
            _entryPeriodExpired,
            _completionPeriodExpired,
            _k,
            _entryFeePercent,
            _exitFeePercent,
            _outgoingTranches,
            _outgoingTranchTimestamps,
            _incomingTranches,
            _incomingTrancheExpired
        );

        _eventEmitter.emitPool_ReservesUpdated(
            _realHoldReserve,
            _virtualHoldReserve,
            _virtualRwaReserve
        );
    }

    /// @notice Claims specified outgoing tranches
    /// @param trancheIndexes Array of tranche indexes to claim
    function claimOutgoingTranches(uint256[] calldata trancheIndexes) external nonReentrant {
        require(!paused, "Pool: paused");
        require(isTargetReached, "Pool: target not reached");
        require(trancheIndexes.length > 0, "Pool: no tranches specified");
        require(msg.sender == owner, "Pool: only owner");

        AddressBook _addressBook = addressBook;
        EventEmitter _eventEmitter = _addressBook.eventEmitter();

        uint256 totalAmountToClaimInBatch = 0;
        uint256 numTranchesInCall = trancheIndexes.length;
        uint256[] memory claimedAmountsForBatch = new uint256[](numTranchesInCall);

        uint256 _outgoingTranchesLenth = outgoingTranches.length;
        bool _floatingOutTranchesTimestamps = floatingOutTranchesTimestamps;
        uint256 _floatingTimestampOffset = floatingTimestampOffset;
        for (uint256 i = 0; i < numTranchesInCall; i++) {
            uint256 index = trancheIndexes[i];
            require(index < _outgoingTranchesLenth, "Pool: invalid tranche index");

            // Check if tranche is already claimed
            require(outgoingTrancheStates[index] == 0, "Pool: tranche already claimed");

            // Check if tranche time has come
            uint256 effectiveTrancheTimestamp = outgoingTranchTimestamps[index];
            if (_floatingOutTranchesTimestamps && _floatingTimestampOffset > 0) {
                effectiveTrancheTimestamp -= _floatingTimestampOffset;
            }
            require(
                block.timestamp >= effectiveTrancheTimestamp,
                "Pool: tranche not yet available"
            );

            uint256 amount = outgoingTranches[index];
            totalAmountToClaimInBatch += amount;

            // Mark tranche as claimed
            outgoingTrancheStates[index] = amount;
            claimedAmountsForBatch[i] = amount;
            _eventEmitter.emitPool_OutgoingTrancheClaimed(msg.sender, index, amount, address(holdToken));
        }

        require(totalAmountToClaimInBatch > 0, "Pool: zero total amount to claim");

        // Update outgoing tranches balance
        uint256 _outgoingTranchesBalance = outgoingTranchesBalance;
        require(_outgoingTranchesBalance >= totalAmountToClaimInBatch, "Pool: insufficient balance");
        _outgoingTranchesBalance -= totalAmountToClaimInBatch;
        outgoingTranchesBalance = _outgoingTranchesBalance;

        // Update total claimed amount
        totalClaimedAmount += totalAmountToClaimInBatch;

        // Transfer HOLD tokens
        require(holdToken.transfer(msg.sender, totalAmountToClaimInBatch), "Pool: transfer failed");

        _eventEmitter.emitPool_OutgoingClaimSummary(
            totalClaimedAmount,
            _outgoingTranchesBalance
        );
    }

    /// @notice Returns funds for incoming tranches
    /// @param amount Amount to return
    function returnIncomingTranche(uint256 amount) external nonReentrant {
        require(!paused, "Pool: paused");
        require(isTargetReached, "Pool: target not reached");
        require(amount > 0, "Pool: zero amount");

        AddressBook _addressBook = addressBook;
        EventEmitter _eventEmitter = _addressBook.eventEmitter();

        uint256 remainingAmount = amount;
        uint256 loopTrancheIndex = lastCompletedIncomingTranche; // Use a separate variable for the loop
        uint256 totalAppliedToDebtInCall = 0;
        uint256 totalAppliedToBonusInCall = 0;

        uint256 _incomingTranchesLength = incomingTranches.length;
        uint256 _totalReturnedAmount = totalReturnedAmount;
        uint256 _expectedHoldAmount = expectedHoldAmount;

        while (remainingAmount > 0 && loopTrancheIndex < _incomingTranchesLength) {
            uint256 trancheAmount = incomingTranches[loopTrancheIndex];
            uint256 trancheAlreadyReturned = incomingTrancheStates[loopTrancheIndex];
            uint256 trancheRemaining = trancheAmount - trancheAlreadyReturned;

            if (trancheRemaining > 0) {
                uint256 portionAmountApplied = remainingAmount > trancheRemaining
                    ? trancheRemaining
                    : remainingAmount;

                incomingTrancheStates[loopTrancheIndex] += portionAmountApplied;
                remainingAmount -= portionAmountApplied;

                uint256 portionAppliedToDebt = 0;
                uint256 portionAppliedToBonus = 0;

                // Track if this amount goes to debt or bonus for this specific portion
                // Consider the sum of (totalReturnedAmount state var + totalAppliedToDebtInCall so far) to check against expectedHoldAmount
                if ((_totalReturnedAmount + totalAppliedToDebtInCall) < _expectedHoldAmount) {
                    uint256 overallRemainingDebt = _expectedHoldAmount -
                        (_totalReturnedAmount + totalAppliedToDebtInCall);
                    uint256 toDebtForPortion = portionAmountApplied > overallRemainingDebt
                        ? overallRemainingDebt
                        : portionAmountApplied;
                    portionAppliedToDebt = toDebtForPortion;
                    portionAppliedToBonus = portionAmountApplied - toDebtForPortion;
                } else {
                    portionAppliedToBonus = portionAmountApplied;
                }

                totalAppliedToDebtInCall += portionAppliedToDebt;
                totalAppliedToBonusInCall += portionAppliedToBonus;

                bool isTrancheNowComplete = incomingTrancheStates[loopTrancheIndex] ==
                    trancheAmount;
                bool wasReturnedOnTime = block.timestamp <=
                    incomingTrancheExpired[loopTrancheIndex];

                _eventEmitter.emitPool_IncomingTrancheUpdate(
                    msg.sender,
                    owner,
                    loopTrancheIndex,
                    portionAmountApplied,
                    isTrancheNowComplete,
                    wasReturnedOnTime,
                    address(holdToken)
                );

                // If tranche is completed, and it's the one we are sequentially processing, advance lastCompletedIncomingTranche
                if (isTrancheNowComplete && loopTrancheIndex == lastCompletedIncomingTranche) {
                    lastCompletedIncomingTranche = loopTrancheIndex + 1;
                }
            }

            loopTrancheIndex++;
        }

        uint256 totalAmountAppliedInCall = amount - remainingAmount;
        require(totalAmountAppliedInCall > 0, "Pool: no amount applied");

        // Transfer tokens from sender
        require(
            holdToken.transferFrom(msg.sender, address(this), totalAmountAppliedInCall),
            "Pool: transfer failed"
        );

        // Update total returned amount (global state)
        _totalReturnedAmount += totalAmountAppliedInCall;
        totalReturnedAmount = _totalReturnedAmount;

        // Update reserves based on debt vs bonus allocation (global state)
        uint256 _realHoldReserve = realHoldReserve;
        uint256 _virtualHoldReserve = virtualHoldReserve;
        if (totalAppliedToDebtInCall > 0) {
            _realHoldReserve += totalAppliedToDebtInCall;
            _virtualHoldReserve -= totalAppliedToDebtInCall;
        }
        realHoldReserve = _realHoldReserve;
        virtualHoldReserve = _virtualHoldReserve;

        if (totalAppliedToBonusInCall > 0) {
            awaitingBonusAmount += totalAppliedToBonusInCall;
        }

        _eventEmitter.emitPool_IncomingReturnSummary(
            _totalReturnedAmount,
            awaitingBonusAmount,
            lastCompletedIncomingTranche
        );

        if (totalAppliedToDebtInCall > 0) {
            _eventEmitter.emitPool_ReservesUpdated(
                _realHoldReserve,
                _virtualHoldReserve,
                virtualRwaReserve
            );
        }

        // Check if fully returned
        if (!isFullyReturned && _totalReturnedAmount == _expectedHoldAmount + expectedBonusAmount) {
            isFullyReturned = true;
            uint256 _fullReturnTimestamp = block.timestamp;
            fullReturnTimestamp = _fullReturnTimestamp;
            _eventEmitter.emitPool_FundsFullyReturned(msg.sender, owner, _fullReturnTimestamp);
        }
    }

    /// @notice Calculates required HOLD amount with fee for minting RWA
    /// @param rwaAmount Amount of RWA tokens to mint
    /// @param allowPartial If true, allows partial mint when rwaAmount exceeds remaining expectedRwa
    /// @return holdAmountWithFee Total amount of HOLD tokens required including fee
    /// @return fee Entry fee amount
    /// @return actualRwaAmount Actual amount of RWA tokens that will be minted
    function estimateMint(
        uint256 rwaAmount,
        bool allowPartial
    ) public view returns (uint256 holdAmountWithFee, uint256 fee, uint256 actualRwaAmount) {
        require(rwaAmount > 0, "Pool: zero input");

        uint256 _virtualRwaReserve = virtualRwaReserve;

        require(rwaAmount < _virtualRwaReserve, "Pool: insufficient RWA reserve");

        // Calculate actual RWA amount considering remaining capacity
        actualRwaAmount = rwaAmount;
        if (fixedSell) {
            uint256 remainingRwa = expectedRwaAmount - awaitingRwaAmount;
            require(remainingRwa > 0, "Pool: fixed RWA amount fully sold");
            if (rwaAmount > remainingRwa) {
                require(allowPartial, "Pool: exceeds fixed RWA amount");
                actualRwaAmount = remainingRwa;
            }
        }

        // Calculate base HOLD needed using constant product formula
        // k = virtualHoldReserve * virtualRwaReserve = (virtualHoldReserve + holdAmount) * (virtualRwaReserve - actualRwaAmount)
        // holdAmount = (k / (virtualRwaReserve - actualRwaAmount)) - (virtualHoldReserve + realHoldReserve)
        uint256 holdAmount = (k / (_virtualRwaReserve - actualRwaAmount)) -
            (virtualHoldReserve + realHoldReserve);

        // Calculate fee and total amount
        fee = (holdAmount * entryFeePercent) / 10000;
        holdAmountWithFee = holdAmount + fee;
    }

    /// @notice Mints RWA tokens for HOLD
    /// @param rwaAmount Amount of RWA tokens to mint
    /// @param maxHoldAmount Maximum amount of HOLD tokens to spend
    /// @param allowPartial If true, allows partial mint when rwaAmount exceeds remaining expectedRwa
    function mint(
        uint256 rwaAmount,
        uint256 maxHoldAmount,
        uint256 validUntil,
        bool allowPartial
    ) external nonReentrant {
        require(!paused, "Pool: paused");
        require(!isFullyReturned, "Pool: funds fully returned");
        require(block.timestamp < completionPeriodExpired, "Pool: completion period expired");
        require(block.timestamp >= entryPeriodStart, "Pool: entry period not started");

        bool _isTargetReached = isTargetReached;
        uint256 _entryPeriodExpired = entryPeriodExpired;

        if (!_isTargetReached) {
            require(block.timestamp < _entryPeriodExpired, "Pool: entry period expired");
        }
        require(block.timestamp <= validUntil, "Pool: transaction expired");

        (uint256 holdAmountWithFee, uint256 fee, uint256 actualRwaAmount) = estimateMint(
            rwaAmount,
            allowPartial
        );
        require(holdAmountWithFee <= maxHoldAmount, "Pool: excessive input amount");

        IERC20 _holdToken = holdToken;
        AddressBook _addressBook = addressBook;
        EventEmitter _eventEmitter = _addressBook.eventEmitter();

        // Transfer HOLD tokens from user
        require(
            _holdToken.transferFrom(msg.sender, address(this), holdAmountWithFee),
            "Pool: hold transfer failed"
        );

        if (fee > 0) {
            require(
                _holdToken.transfer(address(_addressBook.treasury()), fee),
                "Pool: fee transfer failed"
            );
        }

        uint256 _awaitingRwaAmount = awaitingRwaAmount;
        uint256 _expectedRwaAmount = expectedRwaAmount;

        // Calculate percentages before updating state
        uint256 percentBefore = (_awaitingRwaAmount * 10000) / _expectedRwaAmount;
        uint256 userPercent = (actualRwaAmount * 10000) / _expectedRwaAmount;

        // Update awaiting RWA amount and check target
        _awaitingRwaAmount += actualRwaAmount;

        // Update real reserve and virtual RWA
        uint256 _realHoldReserve = realHoldReserve;
        _realHoldReserve += holdAmountWithFee - fee;
        virtualRwaReserve -= actualRwaAmount;

        // Check if target is reached
        if (!_isTargetReached && _awaitingRwaAmount >= _expectedRwaAmount) {
            isTargetReached = true;

            uint256 _expectedHoldAmount = expectedHoldAmount;
            // Move expected amount to outgoing tranches
            require(
                _realHoldReserve >= _expectedHoldAmount,
                "Pool: insufficient balance for tranches"
            );
            uint256 _outgoingTranchesBalance = _expectedHoldAmount;
            outgoingTranchesBalance = _outgoingTranchesBalance;
            _realHoldReserve -= _expectedHoldAmount;
            virtualHoldReserve += _expectedHoldAmount;

            uint256 _floatingTimestampOffset = 0;
            if (floatingOutTranchesTimestamps && block.timestamp < _entryPeriodExpired) {
                uint256 timeSaved = _entryPeriodExpired - block.timestamp;
                if (timeSaved > 1 days) {
                    _floatingTimestampOffset = timeSaved - 1 days;
                }
            }
            floatingTimestampOffset = _floatingTimestampOffset;

            _eventEmitter.emitPool_TargetReached(
                _outgoingTranchesBalance,
                _floatingTimestampOffset,
                owner
            );
        }

        realHoldReserve = _realHoldReserve;
        awaitingRwaAmount = _awaitingRwaAmount;

        // Mint RWA tokens
        rwaToken.mint(msg.sender, tokenId, actualRwaAmount);

        _eventEmitter.emitPool_RwaMinted(
            msg.sender,
            actualRwaAmount,
            (holdAmountWithFee - fee),
            fee,
            percentBefore,
            userPercent,
            _isTargetReached, // use initial value
            parentId,
            entityId,
            address(holdToken)
        );
        _eventEmitter.emitPool_AwaitingRwaAmountUpdated(_awaitingRwaAmount);
        // k changes because virtualRwaReserve changes
        _eventEmitter.emitPool_ReservesUpdated(
            _realHoldReserve,
            virtualHoldReserve,
            virtualRwaReserve
        );
    }

    /// @notice Burns RWA tokens for HOLD
    /// @param rwaAmount Amount of RWA tokens to burn
    /// @param minHoldAmount Minimum amount of HOLD tokens to receive
    function burn(
        uint256 rwaAmount,
        uint256 minHoldAmount,
        uint256 minBonusAmount,
        uint256 validUntil
    ) external nonReentrant {
        require(!paused, "Pool: paused");
        require(block.timestamp <= validUntil, "Pool: transaction expired");
        if (!allowEntryBurn && !isTargetReached) {
            require(
                block.timestamp >= entryPeriodExpired,
                "Pool: burning not allowed during entry period"
            );
        }

        (
            uint256 holdAmountWithoutFee,
            uint256 holdFee,
            uint256 bonusAmountWithoutFee,
            uint256 bonusFee,
            uint256 eligibleRwaAmount
        ) = estimateBurn(rwaAmount);

        // Check minimum amounts separately
        require(holdAmountWithoutFee >= minHoldAmount, "Pool: insufficient hold amount");
        require(bonusAmountWithoutFee >= minBonusAmount, "Pool: insufficient bonus amount");

        IERC20 _holdToken = holdToken;
        AddressBook _addressBook = addressBook;
        EventEmitter _eventEmitter = _addressBook.eventEmitter();

        uint256 _awaitingRwaAmount = awaitingRwaAmount;
        uint256 _expectedRwaAmount = expectedRwaAmount;

        // Calculate percentages before updating state
        uint256 percentBefore = (_awaitingRwaAmount * 10000) / _expectedRwaAmount;
        uint256 userPercent = (rwaAmount * 10000) / _expectedRwaAmount;

        // Update reserves
        realHoldReserve -= (holdAmountWithoutFee + holdFee);
        virtualRwaReserve += rwaAmount;

        // Update awaiting amounts
        _awaitingRwaAmount -= rwaAmount;
        awaitingRwaAmount = _awaitingRwaAmount;
        if (bonusAmountWithoutFee > 0) {
            awaitingBonusAmount -= (bonusAmountWithoutFee + bonusFee);
            rewardedRwaAmount += eligibleRwaAmount;

            _eventEmitter.emitPool_BonusWithdrawn(
                awaitingBonusAmount,
                rewardedRwaAmount
            );
        }

        // Burn RWA tokens
        rwaToken.burn(msg.sender, tokenId, rwaAmount);

        // Transfer HOLD to user
        require(
            _holdToken.transfer(msg.sender, holdAmountWithoutFee + bonusAmountWithoutFee),
            "Pool: hold transfer failed"
        );

        uint256 fee = holdFee + bonusFee;
        if(fee > 0) {
            require(_holdToken.transfer(address(_addressBook.treasury()), fee), "Pool: fee transfer failed");   
        }
        _eventEmitter.emitPool_RwaBurned(
            msg.sender,
            rwaAmount,
            holdAmountWithoutFee,
            bonusAmountWithoutFee,
            holdFee,
            bonusFee,
            percentBefore,
            userPercent,
            isTargetReached,
            parentId,
            entityId,
            address(holdToken)
        );
        _eventEmitter.emitPool_AwaitingRwaAmountUpdated(_awaitingRwaAmount);
        // k changes because virtualRwaReserve changes
        _eventEmitter.emitPool_ReservesUpdated(
            realHoldReserve,
            virtualHoldReserve,
            virtualRwaReserve
        );
    }

    /// @notice Calculates HOLD amounts and fees for burning RWA
    /// @param rwaAmount Amount of RWA tokens to burn
    /// @return holdAmountWithoutFee Base amount of HOLD tokens from AMM before fee
    /// @return holdFee Exit fee on base amount
    /// @return bonusAmountWithoutFee Bonus amount before fee
    /// @return bonusFee Exit fee on bonus amount
    function estimateBurn(
        uint256 rwaAmount
    )
        public
        view
        returns (
            uint256 holdAmountWithoutFee,
            uint256 holdFee,
            uint256 bonusAmountWithoutFee,
            uint256 bonusFee,
            uint256 eligibleRwaAmount
        )
    {
        require(rwaAmount > 0, "Pool: zero input");

        uint256 _virtualRwaReserve = virtualRwaReserve;

        require(rwaAmount <= _virtualRwaReserve, "Pool: insufficient RWA reserve");

        // Calculate total HOLD output using constant product formula
        // k = virtualHoldReserve * virtualRwaReserve = (virtualHoldReserve - holdAmount) * (virtualRwaReserve + rwaAmount)
        // holdAmount = (virtualHoldReserve + realHoldReserve) - (k / (virtualRwaReserve + rwaAmount))
        uint256 totalHoldAmount = (virtualHoldReserve + realHoldReserve) -
            (k / (_virtualRwaReserve + rwaAmount));

        // Calculate total bonus amount if available

        uint256 _awaitingRwaAmount = awaitingRwaAmount;
        uint256 _awaitingBonusAmount = awaitingBonusAmount;

        uint256 totalBonusAmount = 0;
        bool hasBonuses = _awaitingBonusAmount > 0 && _awaitingRwaAmount > 0;

        if (hasBonuses && checkBonusesUnlocked()) {
            // Calculate how much RWA is still eligible for bonus
            uint256 _expectedRwaAmount = expectedRwaAmount;
            uint256 _rewardedRwaAmount = rewardedRwaAmount;
            uint256 availableRwaAmountToBonus = _expectedRwaAmount > _rewardedRwaAmount
                ? _expectedRwaAmount - _rewardedRwaAmount
                : 0;

            // Cap by remaining RWA in pool
            if (availableRwaAmountToBonus > _awaitingRwaAmount) {
                availableRwaAmountToBonus = _awaitingRwaAmount;
            }

            if (availableRwaAmountToBonus > 0) {
                eligibleRwaAmount = rwaAmount > availableRwaAmountToBonus
                    ? availableRwaAmountToBonus
                    : rwaAmount;
                totalBonusAmount =
                    (_awaitingBonusAmount * eligibleRwaAmount) /
                    availableRwaAmountToBonus;
            }
        }

        // Calculate fees
        holdFee = (totalHoldAmount * exitFeePercent) / 10000;
        bonusFee = (totalBonusAmount * exitFeePercent) / 10000;

        // Calculate amounts without fees
        holdAmountWithoutFee = totalHoldAmount - holdFee;
        bonusAmountWithoutFee = totalBonusAmount - bonusFee;
    }

    /// @notice Returns the timestamp when bonuses will be unlocked
    /// @return Timestamp when bonuses will be unlocked
    function getBonusUnlockTimestamp() public view returns (uint256) {
        if (!awaitCompletionExpired && isFullyReturned) {
            return fullReturnTimestamp + 1 days;
        }
        return completionPeriodExpired + 1 days;
    }

    /// @notice Checks if bonuses are unlocked
    /// @return True if bonuses are unlocked, false otherwise
    function checkBonusesUnlocked() public view returns (bool) {
        return block.timestamp >= getBonusUnlockTimestamp();
    }

    /// @notice Enables emergency pause on the pool
    /// @dev Can only be called by governance. Pool operations will be blocked.
    function enablePause() external {
        addressBook.requireGovernance(msg.sender);
        require(!paused, "Pool: already paused");
        paused = true;
        addressBook.eventEmitter().emitPool_PausedStateChanged(true);
    }

    /// @notice Disables emergency pause on the pool
    /// @dev Can only be called by governance. Pool operations will be unblocked.
    function disablePause() external {
        addressBook.requireGovernance(msg.sender);
        require(paused, "Pool: not paused");
        paused = false;
        addressBook.eventEmitter().emitPool_PausedStateChanged(false);
    }

    /// @notice Returns arrays of outgoing tranches information
    /// @return amounts Array of outgoing tranche amounts
    /// @return timestamps Array of outgoing tranche delays
    /// @return states Array of outgoing tranche states (claimed amounts)
    function getOutgoingTranches()
        external
        view
        returns (uint256[] memory amounts, uint256[] memory timestamps, uint256[] memory states)
    {
        return (outgoingTranches, outgoingTranchTimestamps, outgoingTrancheStates);
    }

    /// @notice Returns arrays of incoming tranches information
    /// @return amounts Array of incoming tranche amounts
    /// @return expired Array of incoming tranche expiration timestamps
    /// @return states Array of incoming tranche states (returned amounts)
    function getIncomingTranches()
        external
        view
        returns (uint256[] memory amounts, uint256[] memory expired, uint256[] memory states)
    {
        return (incomingTranches, incomingTrancheExpired, incomingTrancheStates);
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("Pool");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireGovernance(msg.sender);
    }
}
