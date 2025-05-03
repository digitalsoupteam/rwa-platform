// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RWA } from "./RWA.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AddressBook } from "../system/AddressBook.sol";

contract Pool is ReentrancyGuard {
    /// @notice If true, bonuses are available after completionExpired. If false, after 1 day since full return
    bool public immutable bonusAfterCompletion;
    /// @notice HOLD token contract
    IERC20 public immutable holdToken;

    /// @notice RWA token contract
    RWA public immutable rwaToken;

    /// @notice Address book contract
    AddressBook public immutable addressBook;

    /// @notice RWA token ID used in this pool
    uint256 public immutable tokenId;

    /// @notice Entity ID in the database
    string public entityId;
    
    /// @notice Entity owner ID in the database
    string public entityOwnerId;
    
    /// @notice Entity owner type in the database
    string public entityOwnerType;

    /// @notice Owner address
    address public immutable owner;

    /// @notice Expected amount in HOLD tokens for program participation
    uint256 public immutable expectedHoldAmount;

    /// @notice Expected amount of RWA tokens for the program
    uint256 public immutable expectedRwaAmount;

    /// @notice Expected bonus amount in HOLD tokens
    uint256 public immutable expectedBonusAmount;

    /// @notice Reward percentage for calculating bonus (in basis points)
    uint256 public immutable rewardPercent;

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

    /// @notice Emergency pause flag
    bool public paused;

    /// @notice Flag indicating if RWA amount is fixed
    bool public immutable fixedSell;

    /// @notice Flag indicating if burning is allowed during entry period
    bool public immutable allowEntryBurn;

    /// @notice Program entry period start timestamp
    uint256 public entryPeriodStart;

    /// @notice Program entry period expiration timestamp
    uint256 public entryPeriodExpired;

    /// @notice Program completion period expiration timestamp
    uint256 public completionPeriodExpired;

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

    /// @notice Constant product for AMM calculations (k = virtualHoldReserve * virtualRwaReserve)
    uint256 public k;

    /// @notice Fee percentage charged when entering the pool (in basis points)
    uint256 public entryFeePercent;

    /// @notice Fee percentage charged when exiting the pool (in basis points)
    uint256 public exitFeePercent;

    /// @notice Array of outgoing tranche amounts
    uint256[] public outgoingTranches;

    /// @notice Array of outgoing tranche timestamps
    uint256[] public outgoingTranchTimestamps;

    /// @notice Array tracking claimed amounts for each outgoing tranche
    uint256[] public outgoingTrancheStates;

    /// @notice Array of incoming tranche amounts
    uint256[] public incomingTranches;

    /// @notice Array of incoming tranche expiration timestamps
    uint256[] public incomingTrancheExpired;

    /// @notice Array tracking returned amounts for each incoming tranche
    uint256[] public incomingTrancheStates;

    /// @notice Index of the last fully completed incoming tranche
    uint256 public lastCompletedIncomingTranche;

    constructor(
        address _holdToken,
        address _rwaToken,
        address _addressBook,
        uint256 _tokenId,
        string memory _entityId,
        string memory _entityOwnerId,
        string memory _entityOwnerType,
        address _owner,
        uint256 _expectedHoldAmount,
        uint256 _expectedRwaAmount,
        uint256 _liquidityCoefficient,
        uint256 _entryFeePercent,
        uint256 _exitFeePercent,
        uint256 _entryPeriodStart,
        uint256 _rewardPercent,
        bool _fixedSell,
        bool _allowEntryBurn,
        bool _bonusAfterCompletion,
        uint256[] memory _outgoingTranches,
        uint256[] memory _outgoingTranchTimestamps,
        uint256[] memory _incomingTranches,
        uint256[] memory _incomingTrancheExpired
    ) {
        require(_holdToken != address(0), "Pool: zero hold token");
        require(_rwaToken != address(0), "Pool: zero rwa token");
        require(_addressBook != address(0), "Pool: zero address book");
        require(_owner != address(0), "Pool: zero owner address");
        require(bytes(_entityId).length > 0, "Pool: empty entity id");
        require(bytes(_entityOwnerId).length > 0, "Pool: empty entity owner id");
        require(bytes(_entityOwnerType).length > 0, "Pool: empty entity owner type");
        require(_expectedHoldAmount > 0, "Pool: zero expected hold amount");
        require(_expectedRwaAmount > 0, "Pool: zero expected rwa amount");
        require(_liquidityCoefficient > 0, "Pool: zero liquidity coefficient");
        require(_entryFeePercent <= 1000, "Pool: entry fee too high"); // Max 10%
        require(_exitFeePercent <= 1000, "Pool: exit fee too high"); // Max 10%
        require(_rewardPercent > 0, "Pool: reward percent must be positive");
        require(_entryPeriodStart > block.timestamp - 1 days, "Pool: invalid entry period start");
        require(_outgoingTranches.length > 0, "Pool: no outgoing tranches");
        require(_outgoingTranches.length == _outgoingTranchTimestamps.length, "Pool: tranche arrays length mismatch");
        require(_incomingTranches.length > 0, "Pool: no incoming tranches");
        require(_incomingTranches.length == _incomingTrancheExpired.length, "Pool: tranche arrays length mismatch");

       
        require(_outgoingTranchTimestamps[0] > _entryPeriodStart, "Pool: first outgoing tranche must be after entry start");

        uint256 _expectedBonusAmount = (_expectedHoldAmount * _rewardPercent) / 10000;

        uint256 totalOutgoing = 0;
        for(uint256 i = 0; i < _outgoingTranches.length; i++) {
            require(_outgoingTranches[i] > 0, "Pool: zero tranche amount");
            if(i > 0) {
                require(_outgoingTranchTimestamps[i] >= _outgoingTranchTimestamps[i - 1] + 1 days,
                    "Pool: outgoing tranche delay must be at least 1 day after previous"
                );
            }
            totalOutgoing += _outgoingTranches[i];
        }
        require(totalOutgoing == _expectedHoldAmount, "Pool: outgoing tranches must equal expected amount");


        uint256 totalIncoming = 0;
        for(uint256 i = 0; i < _incomingTranches.length; i++) {
            require(_incomingTranches[i] > 0, "Pool: zero tranche amount");
            if(i > 0) {
                require(_incomingTrancheExpired[i] >= _incomingTrancheExpired[i - 1] + 1 days,
                    "Pool: incoming tranche expiration must be at least 1 day after previous"
                );
            }
            totalIncoming += _incomingTranches[i];
        }
        require(totalIncoming == _expectedHoldAmount + _expectedBonusAmount, "Pool: incoming tranches must equal total expected amount");

        entryPeriodStart = _entryPeriodStart;
        entryPeriodExpired = _outgoingTranchTimestamps[0];
        completionPeriodExpired = _incomingTrancheExpired[_incomingTrancheExpired.length - 1];
        require(completionPeriodExpired > entryPeriodExpired, "Pool: completion must be after entry period");

        holdToken = IERC20(_holdToken);
        rwaToken = RWA(_rwaToken);
        addressBook = AddressBook(_addressBook);
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
        bonusAfterCompletion = _bonusAfterCompletion;
        allowEntryBurn = _allowEntryBurn;
        awaitingRwaAmount = 0;

        // Initialize reserves using liquidity coefficient
        virtualHoldReserve = _expectedHoldAmount * _liquidityCoefficient;
        virtualRwaReserve = _expectedRwaAmount * (_liquidityCoefficient + 1);
        realHoldReserve = 0;
        outgoingTranchesBalance = 0;
        k = virtualHoldReserve * virtualRwaReserve;
        
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
    }

    /// @notice Claims specified outgoing tranches
    /// @param trancheIndexes Array of tranche indexes to claim
    function claimOutgoingTranches(uint256[] calldata trancheIndexes) external nonReentrant {
        require(!paused, "Pool: paused");
        require(trancheIndexes.length > 0, "Pool: no tranches specified");

        uint256 totalAmount = 0;
        
        for (uint256 i = 0; i < trancheIndexes.length; i++) {
            uint256 index = trancheIndexes[i];
            require(index < outgoingTranches.length, "Pool: invalid tranche index");
            
            // Check if tranche is already claimed
            require(outgoingTrancheStates[index] == 0, "Pool: tranche already claimed");
            
            // Check if tranche time has come
            require(block.timestamp >= outgoingTranchTimestamps[index], "Pool: tranche not yet available");
            
            uint256 amount = outgoingTranches[index];
            totalAmount += amount;
            
            // Mark tranche as claimed
            outgoingTrancheStates[index] = amount;
        }

        require(totalAmount > 0, "Pool: zero total amount");
        
        // Update outgoing tranches balance
        require(outgoingTranchesBalance >= totalAmount, "Pool: insufficient balance");
        outgoingTranchesBalance -= totalAmount;

        // Update total claimed amount
        totalClaimedAmount += totalAmount;

        // Transfer HOLD tokens
        require(holdToken.transfer(msg.sender, totalAmount), "Pool: transfer failed");
    }

    /// @notice Returns funds for incoming tranches
    /// @param amount Amount to return
    function returnIncomingTranche(uint256 amount) external nonReentrant {
        require(!paused, "Pool: paused");
        require(amount > 0, "Pool: zero amount");
        
        uint256 remainingAmount = amount;
        uint256 currentTrancheIndex = lastCompletedIncomingTranche;
        uint256 appliedToDebt = 0;
        uint256 appliedToBonus = 0;
        
        while (remainingAmount > 0 && currentTrancheIndex < incomingTranches.length) {
            uint256 trancheAmount = incomingTranches[currentTrancheIndex];
            uint256 trancheRemaining = trancheAmount - incomingTrancheStates[currentTrancheIndex];
            
            if (trancheRemaining > 0) {
                uint256 amountToApply = remainingAmount > trancheRemaining ? trancheRemaining : remainingAmount;
                
                incomingTrancheStates[currentTrancheIndex] += amountToApply;
                remainingAmount -= amountToApply;

                // Track if this amount goes to debt or bonus
                if (totalReturnedAmount < expectedHoldAmount) {
                    uint256 remainingDebt = expectedHoldAmount - totalReturnedAmount;
                    uint256 toDebt = amountToApply > remainingDebt ? remainingDebt : amountToApply;
                    appliedToDebt += toDebt;
                    appliedToBonus += amountToApply - toDebt;
                } else {
                    appliedToBonus += amountToApply;
                }
                
                // If tranche is completed, move to next
                if (incomingTrancheStates[currentTrancheIndex] == trancheAmount) {
                    lastCompletedIncomingTranche = currentTrancheIndex + 1;
                }
            }
            
            currentTrancheIndex++;
        }

        uint256 appliedAmount = amount - remainingAmount;
        require(appliedAmount > 0, "Pool: no amount applied");

        // Transfer tokens from sender
        require(holdToken.transferFrom(msg.sender, address(this), appliedAmount), "Pool: transfer failed");
        
        // Update total returned amount
        totalReturnedAmount += appliedAmount;

        // Update reserves based on debt vs bonus allocation
        if (appliedToDebt > 0) {
            realHoldReserve += appliedToDebt;
            virtualHoldReserve -= appliedToDebt;
        }
        if (appliedToBonus > 0) {
            awaitingBonusAmount += appliedToBonus;
        }

        // Check if fully returned
        if (!isFullyReturned && totalReturnedAmount == expectedHoldAmount + expectedBonusAmount) {
            isFullyReturned = true;
            fullReturnTimestamp = block.timestamp;
        }
    }

    /// @notice Calculates required HOLD amount with fee for minting RWA
    /// @param rwaAmount Amount of RWA tokens to mint
    /// @param allowPartial If true, allows partial mint when rwaAmount exceeds remaining expectedRwa
    /// @return holdAmountWithFee Total amount of HOLD tokens required including fee
    /// @return fee Entry fee amount
    /// @return actualRwaAmount Actual amount of RWA tokens that will be minted
    function estimateMint(uint256 rwaAmount, bool allowPartial) public view returns (
        uint256 holdAmountWithFee,
        uint256 fee,
        uint256 actualRwaAmount
    ) {
        require(rwaAmount > 0, "Pool: zero input");
        require(rwaAmount < virtualRwaReserve, "Pool: insufficient RWA reserve");

        // Calculate actual RWA amount considering remaining capacity
        actualRwaAmount = rwaAmount;
        if (fixedSell) {
            uint256 remainingRwa = expectedRwaAmount - awaitingRwaAmount;
            if (rwaAmount > remainingRwa) {
                require(allowPartial, "Pool: exceeds fixed RWA amount");
                actualRwaAmount = remainingRwa;
            }
        }

        // Calculate base HOLD needed using constant product formula
        // k = virtualHoldReserve * virtualRwaReserve = (virtualHoldReserve + holdAmount) * (virtualRwaReserve - actualRwaAmount)
        // holdAmount = (k / (virtualRwaReserve - actualRwaAmount)) - (virtualHoldReserve + realHoldReserve)
        uint256 holdAmount = (k / (virtualRwaReserve - actualRwaAmount)) - (virtualHoldReserve + realHoldReserve);
        
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
        require(block.timestamp >= entryPeriodStart, "Pool: entry period not started");
        if(!isTargetReached) {
            require(block.timestamp < entryPeriodExpired, "Pool: entry period expired");
        }
        require(block.timestamp <= validUntil, "Pool: transaction expired");
        require(block.timestamp < completionPeriodExpired, "Pool: completion period expired");

        (uint256 holdAmountWithFee, uint256 fee, uint256 actualRwaAmount) = estimateMint(rwaAmount, allowPartial);
        require(holdAmountWithFee <= maxHoldAmount, "Pool: excessive input amount");

        // Transfer HOLD tokens from user
        require(
            holdToken.transferFrom(msg.sender, address(this), holdAmountWithFee),
            "Pool: hold transfer failed"
        );

        address treasury = address(addressBook.treasury());
        require(holdToken.transfer(treasury, fee), "Pool: fee transfer failed");

        // Update awaiting RWA amount and check target
        awaitingRwaAmount += actualRwaAmount;
        
        // Update real reserve and virtual RWA
        realHoldReserve += holdAmountWithFee - fee;
        virtualRwaReserve -= actualRwaAmount;

        // Check if target is reached
        if (!isTargetReached && awaitingRwaAmount >= expectedRwaAmount) {
            isTargetReached = true;
            
            // Move expected amount to outgoing tranches
            require(realHoldReserve >= expectedHoldAmount, "Pool: insufficient balance for tranches");
            outgoingTranchesBalance = expectedHoldAmount;
            realHoldReserve -= expectedHoldAmount;
            virtualHoldReserve += expectedHoldAmount;
        }

        // Mint RWA tokens
        rwaToken.mint(msg.sender, tokenId, actualRwaAmount);
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
        if (!allowEntryBurn) {
            require(
                block.timestamp >= entryPeriodExpired,
                "Pool: burning not allowed during entry period"
            );
        }

        (
            uint256 holdAmountWithoutFee,
            uint256 holdFee,
            uint256 bonusAmountWithoutFee,
            uint256 bonusFee
        ) = estimateBurn(rwaAmount);
        
        // Check minimum amounts separately
        require(holdAmountWithoutFee >= minHoldAmount, "Pool: insufficient hold amount");
        require(bonusAmountWithoutFee >= minBonusAmount, "Pool: insufficient bonus amount");
        
        // Update reserves
        realHoldReserve -= (holdAmountWithoutFee + holdFee);
        virtualRwaReserve += rwaAmount;
        
        // Update awaiting amounts
        awaitingRwaAmount -= rwaAmount;
        if (bonusAmountWithoutFee > 0) {
            awaitingBonusAmount -= (bonusAmountWithoutFee + bonusFee);
        }
        
        // Burn RWA tokens
        rwaToken.burn(msg.sender, tokenId, rwaAmount);

        // Transfer HOLD to user
        require(
            holdToken.transfer(msg.sender, holdAmountWithoutFee + bonusAmountWithoutFee),
            "Pool: hold transfer failed"
        );

        // Transfer fee to treasury
        address treasury = address(addressBook.treasury());
        require(holdToken.transfer(treasury, holdFee + bonusFee), "Pool: fee transfer failed");
    }

    /// @notice Calculates HOLD amounts and fees for burning RWA
    /// @param rwaAmount Amount of RWA tokens to burn
    /// @return holdAmountWithoutFee Base amount of HOLD tokens from AMM before fee
    /// @return holdFee Exit fee on base amount
    /// @return bonusAmountWithoutFee Bonus amount before fee
    /// @return bonusFee Exit fee on bonus amount
    function estimateBurn(uint256 rwaAmount) public view returns (
        uint256 holdAmountWithoutFee,
        uint256 holdFee,
        uint256 bonusAmountWithoutFee,
        uint256 bonusFee
    ) {
        require(rwaAmount > 0, "Pool: zero input");
        require(rwaAmount <= virtualRwaReserve, "Pool: insufficient RWA reserve");

        // Calculate total HOLD output using constant product formula
        // k = virtualHoldReserve * virtualRwaReserve = (virtualHoldReserve - holdAmount) * (virtualRwaReserve + rwaAmount)
        // holdAmount = (virtualHoldReserve + realHoldReserve) - (k / (virtualRwaReserve + rwaAmount))
        uint256 totalHoldAmount = (virtualHoldReserve + realHoldReserve) - (k / (virtualRwaReserve + rwaAmount));
        
        // Calculate total bonus amount if available
        uint256 totalBonusAmount = 0;
        bool hasBonuses = awaitingBonusAmount > 0 && awaitingRwaAmount > 0;
        
        bool bonusesUnlocked = block.timestamp >= completionPeriodExpired ||
            (!bonusAfterCompletion && isFullyReturned && block.timestamp >= fullReturnTimestamp + 1 days);

        if (hasBonuses && bonusesUnlocked) {
            totalBonusAmount = (awaitingBonusAmount * rwaAmount) / awaitingRwaAmount;
        }

        // Calculate fees
        holdFee = (totalHoldAmount * exitFeePercent) / 10000;
        bonusFee = (totalBonusAmount * exitFeePercent) / 10000;

        // Calculate amounts without fees
        holdAmountWithoutFee = totalHoldAmount - holdFee;
        bonusAmountWithoutFee = totalBonusAmount - bonusFee;
    }

    /// @notice Returns arrays of outgoing tranches information
    /// @return amounts Array of outgoing tranche amounts
    /// @return timestamps Array of outgoing tranche delays
    /// @return states Array of outgoing tranche states (claimed amounts)
    function getOutgoingTranches() external view returns (
        uint256[] memory amounts,
        uint256[] memory timestamps,
        uint256[] memory states
    ) {
        return (outgoingTranches, outgoingTranchTimestamps, outgoingTrancheStates);
    }

    /// @notice Returns arrays of incoming tranches information
    /// @return amounts Array of incoming tranche amounts
    /// @return expired Array of incoming tranche expiration timestamps
    /// @return states Array of incoming tranche states (returned amounts)
    function getIncomingTranches() external view returns (
        uint256[] memory amounts,
        uint256[] memory expired,
        uint256[] memory states
    ) {
        return (incomingTranches, incomingTrancheExpired, incomingTrancheStates);
    }
}