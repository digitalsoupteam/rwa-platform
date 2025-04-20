// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { BasePool } from "./BasePool.sol";
import { Config } from "../../system/Config.sol";

/// @title SpeculationPool
/// @notice Pool for speculative trading between HOLD and RWA tokens
/// @dev Implements AMM functionality with constant product formula
contract SpeculationPool is BasePool {
    /// @notice Current amount of real HOLD tokens in pool
    uint256 public realHoldReserve;

    /// @notice Virtual amount of HOLD tokens in pool
    uint256 public virtualHoldReserve;

    /// @notice Virtual amount of RWA tokens in pool
    uint256 public virtualRwaReserve;

    /// @notice Constant product for AMM calculations (k = virtualRwaReserve * virtualHoldReserve)
    uint256 public k;

    /// @notice Available bonus amount for distribution to RWA token holders
    uint256 public availableBonusAmount;

    /// @notice Expected total bonus amount to be distributed
    /// @dev Immutable after initialization
    uint256 public expectedBonusAmount;


    uint256 public speculationRwaMultiplier;

    /// @notice Custom initialization for speculation pool
    /// @param payload Encoded (virtualHoldReserve, virtualRwaReserve)
    /// @return Encoded initialization data
    function _initializeCustom(
        bytes memory payload
    ) internal override onlyInitializing returns (bytes memory) {
        (uint256 rwaMultiplierIndex) = abi.decode(
            payload,
            (uint256)
        );

        Config config = addressBook.config();
        
        // Get multipliers from config
        uint256 rwaMultiplier = config.getSpeculationRwaMultiplier(rwaMultiplierIndex);
        uint256 holdMultiplier = config.speculationHoldMultiplier();

        // Calculate virtual reserves based on expected amounts and multipliers
        virtualHoldReserve = expectedHoldAmount * holdMultiplier;
        virtualRwaReserve = expectedRwaAmount * rwaMultiplier;
        realHoldReserve = 0;
        k = virtualRwaReserve * virtualHoldReserve;
        availableBonusAmount = 0;
        expectedBonusAmount = (expectedHoldAmount * rewardPercent) / 10000;

        // Return encoded initialization data
        return
            abi.encode(
                virtualHoldReserve,
                virtualRwaReserve,
                realHoldReserve,
                k,
                availableBonusAmount,
                expectedBonusAmount
            );
    }

    /// @notice Returns the type of pool as a string
    /// @return Pool type identifier
    function poolType() public pure override returns (string memory) {
        return "speculation";
    }

    /// @notice Validates if trading is currently allowed
    /// @param validUntil Transaction validity timestamp
    /// @param isRWAIn True if input token is RWA (selling RWA), false if HOLD (buying RWA)
    function validateTrading(uint256 validUntil, bool isRWAIn) public view {
        require(!paused, "Pool: paused");
        require(block.timestamp <= validUntil, "Pool: transaction expired");

        if (!isRWAIn && block.timestamp > entryPeriodExpired) {
            require(isTargetReached, "Pool: buying disabled, target not reached");
            require(
                block.timestamp <= completionPeriodExpired,
                "Pool: buying disabled after completion"
            );
        }
    }

    /// @notice Allows product owner to return amount to pool
    /// @param amount Amount to return
    /// @dev Overrides base returnAmount to handle bonus distribution and virtual/real HOLD conversion
    function returnAmount(uint256 amount) public override nonReentrant {
        // Calculate remaining principal amount to be returned
        uint256 remainingPrincipal = expectedHoldAmount > returnedAmount
            ? expectedHoldAmount - returnedAmount
            : 0;

        // Calculate principal and bonus portions
        uint256 principalAmount;
        uint256 bonusAmount;

        if (remainingPrincipal > 0) {
            // If there's still principal to return
            principalAmount = amount > remainingPrincipal ? remainingPrincipal : amount;
            bonusAmount = amount - principalAmount;
        } else {
            // If principal is fully returned, everything goes to bonus
            principalAmount = 0;
            bonusAmount = amount;
        }

        // Update pool state before calling base implementation
        if (principalAmount > 0) {
            realHoldReserve += principalAmount;
            virtualHoldReserve -= principalAmount;
        }

        if (bonusAmount > 0) {
            availableBonusAmount += bonusAmount;
        }

        // Call base implementation to handle common logic
        _returnAmount(amount);
    }

    /// @notice Calculates bonus amount for RWA tokens
    /// @param rwaAmount Amount of RWA tokens
    /// @return bonus Amount of bonus HOLD tokens
    function calculateBonus(uint256 rwaAmount) public view returns (uint256 bonus) {
        if (block.timestamp > completionPeriodExpired && availableBonusAmount > 0) {
            uint256 calculatedBonus = (rwaAmount * expectedBonusAmount) / expectedRwaAmount;
            return calculatedBonus < availableBonusAmount ? calculatedBonus : availableBonusAmount;
        }
        return 0;
    }

    /// @notice Estimates output amount for exact input swap
    /// @param amountIn Amount of input tokens
    /// @param isRWAIn True if input token is RWA, false if HOLD
    /// @return amountOut Expected output amount
    /// @return fee Fee amount in output token
    function estimateSwapExactInput(
        uint256 amountIn,
        bool isRWAIn
    ) public view returns (uint256 amountOut, uint256 fee) {
        require(amountIn > 0, "Pool: zero input");

        // Get current reserves based on direction
        uint256 inputReserve = isRWAIn ? virtualRwaReserve : virtualHoldReserve + realHoldReserve;
        uint256 outputReserve = isRWAIn ? virtualHoldReserve + realHoldReserve : virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "Pool: insufficient liquidity");

        // Calculate output amount using constant product formula
        uint256 amountInWithFee = isRWAIn
            ? amountIn
            : (amountIn * (10000 - entryFeePercent)) / 10000;
        uint256 numerator = amountInWithFee * outputReserve;
        uint256 denominator = inputReserve + amountInWithFee;
        amountOut = numerator / denominator;

        // Calculate fee
        fee = isRWAIn
            ? (amountOut * exitFeePercent) / 10000 // Fee in HOLD when selling RWA
            : (amountIn * entryFeePercent) / 10000; // Fee in HOLD when buying RWA
    }

    /// @notice Estimates input amount for exact output swap
    /// @param amountOut Desired output amount
    /// @param isRWAIn True if input token is RWA, false if HOLD
    /// @return amountIn Required input amount
    /// @return fee Fee amount in input token
    function estimateSwapExactOutput(
        uint256 amountOut,
        bool isRWAIn
    ) public view returns (uint256 amountIn, uint256 fee) {
        require(amountOut > 0, "Pool: zero output");

        // Get current reserves based on direction
        uint256 inputReserve = isRWAIn ? virtualRwaReserve : virtualHoldReserve + realHoldReserve;
        uint256 outputReserve = isRWAIn ? virtualHoldReserve + realHoldReserve : virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "Pool: insufficient liquidity");
        require(amountOut < outputReserve, "Pool: insufficient output reserve");

        // Calculate input amount using constant product formula
        uint256 numerator = inputReserve * amountOut;
        uint256 denominator = outputReserve - amountOut;
        amountIn = (numerator / denominator) + 1; // +1 to handle rounding

        // Calculate fee
        fee = isRWAIn
            ? (amountOut * exitFeePercent) / 10000 // Fee in HOLD when selling RWA
            : (amountIn * entryFeePercent) / 10000; // Fee in HOLD when buying RWA
    }

    /// @notice Swaps exact input amount for output tokens
    /// @param amountIn Amount of input tokens
    /// @param minAmountOut Minimum amount of output tokens to receive
    /// @param validUntil Transaction validity timestamp
    /// @param isRWAIn True if input token is RWA, false if HOLD
    /// @return amountOut Amount of output tokens received
    function swapExactInput(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 validUntil,
        bool isRWAIn
    ) external nonReentrant returns (uint256) {
        validateTrading(validUntil, isRWAIn);

        // Calculate output amount
        (uint256 amountOut, uint256 fee) = estimateSwapExactInput(amountIn, isRWAIn);
        require(amountOut >= minAmountOut, "Pool: insufficient output amount");

        _swap(amountIn, amountOut, fee, isRWAIn);

        return amountOut;
    }

    /// @notice Swaps tokens to receive exact output amount
    /// @param amountOut Desired amount of output tokens
    /// @param maxAmountIn Maximum amount of input tokens to spend
    /// @param validUntil Transaction validity timestamp
    /// @param isRWAIn True if input token is RWA, false if HOLD
    /// @return amountIn Amount of input tokens spent
    function swapExactOutput(
        uint256 amountOut,
        uint256 maxAmountIn,
        uint256 validUntil,
        bool isRWAIn
    ) external nonReentrant returns (uint256) {
        validateTrading(validUntil, isRWAIn);

        // Calculate input amount
        (uint256 amountIn, uint256 fee) = estimateSwapExactOutput(amountOut, isRWAIn);
        require(amountIn + fee <= maxAmountIn, "Pool: excessive input amount");

        _swap(amountIn, amountOut, fee, isRWAIn);

        return amountIn;
    }

    function _swap(uint256 amountIn, uint256 amountOut, uint256 fee, bool isRWAIn) internal {
        if (isRWAIn) {
            // Selling RWA for HOLD
            require(amountOut <= realHoldReserve, "Pool: insufficient real HOLD");

            // Update reserves
            virtualRwaReserve += amountIn;
            realHoldReserve -= amountOut + fee;
            awaitingRwaAmount -= amountIn;

            // Update investment progress if target not reached
            if (!isTargetReached) {
                accumulatedHoldAmount -= amountOut;
                accumulatedRwaAmount -= amountIn;
                addressBook.eventEmitter().emitPool_AccumulatedAmountsUpdated(
                    entityId,
                    accumulatedHoldAmount,
                    accumulatedRwaAmount
                );
            }

            // Transfer tokens
            rwa.burn(msg.sender, tokenId, amountIn);
            require(holdToken.transfer(msg.sender, amountOut), "Pool: transfer failed");

            // Calculate and distribute bonus if applicable
            if (block.timestamp > completionPeriodExpired) {
                uint256 bonus = calculateBonus(amountIn);
                if (bonus > 0) {
                    require(holdToken.transfer(msg.sender, bonus), "Pool: bonus transfer failed");
                    availableBonusAmount -= bonus;
                    availableReturnBalance -= bonus;
                }

                if (awaitingRwaAmount <= expectedRwaAmount) {
                    if (amountOut > availableReturnBalance) {
                        availableReturnBalance = 0;
                    } else {
                        availableReturnBalance -= amountOut;
                    }
                }
            }
        } else {
            // Buying RWA with HOLD
            // Update reserves
            realHoldReserve += amountIn;
            virtualRwaReserve -= amountOut;
            awaitingRwaAmount += amountOut;

            // Transfer tokens
            require(
                holdToken.transferFrom(msg.sender, address(this), amountIn + fee),
                "Pool: transfer from failed"
            );
            rwa.mint(msg.sender, tokenId, amountOut);

            // Update investment progress if target not reached
            if (!isTargetReached) {
                // Update accumulatedHoldAmount
                uint256 remainingHold = expectedHoldAmount - accumulatedHoldAmount;
                if (remainingHold > 0) {
                    uint256 holdToAdd = amountIn > remainingHold ? remainingHold : amountIn;
                    accumulatedHoldAmount += holdToAdd;
                }

                // Update accumulatedRwaAmount
                uint256 remainingRwa = expectedRwaAmount - accumulatedRwaAmount;
                if (remainingRwa > 0) {
                    uint256 rwaToAdd = amountOut > remainingRwa ? remainingRwa : amountOut;
                    accumulatedRwaAmount += rwaToAdd;
                }

                if (remainingHold > 0 || remainingRwa > 0) {
                    addressBook.eventEmitter().emitPool_AccumulatedAmountsUpdated(
                        entityId,
                        accumulatedHoldAmount,
                        accumulatedRwaAmount
                    );
                }

                // Check if target is reached
                if (accumulatedHoldAmount == expectedHoldAmount) {
                    isTargetReached = true;
                    allocatedHoldAmount = expectedHoldAmount;
                    virtualHoldReserve += expectedHoldAmount;
                    realHoldReserve -= expectedHoldAmount;

                    addressBook.eventEmitter().emitPool_TargetReached(
                        entityId,
                        allocatedHoldAmount
                    );
                }
            }
        }

        // Send fee to treasury
        address treasury = address(addressBook.treasury());
        require(holdToken.transfer(treasury, fee), "Pool: fee transfer failed");
    }
}
