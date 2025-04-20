// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { BasePool } from "./BasePool.sol";

/// @title StablePool
/// @notice Pool for fixed price trading between HOLD token and RWA token
/// @dev Implements simple vending machine style trading
contract StablePool is BasePool {
    /// @notice Fixed price in HOLD tokens for 1 RWA token
    uint256 public fixedMintPrice;

    /// @notice Returns the type of pool
    /// @return Pool type identifier
    function poolType() public pure override returns (string memory) {
        return "stable";
    }

    /// @notice Custom initialization for stable pool
    /// @param payload Additional initialization data (not used in stable pool)
    /// @return Pool type and initialization data
    function _initializeCustom(bytes memory payload) internal override onlyInitializing returns (bytes memory) {
        fixedMintPrice = expectedHoldAmount / expectedRwaAmount;
        
        // Return pool type and encoded initialization data
        return abi.encode(fixedMintPrice);
    }

    /// @notice Calculates required HOLD amount for minting RWA
    /// @param rwaAmount Amount of RWA tokens to mint
    /// @return requiredHold Amount of HOLD tokens required including fee
    /// @return fee Fee amount in HOLD tokens
    function getMintCost(uint256 rwaAmount) public view returns (uint256 requiredHold, uint256 fee) {
        require(rwaAmount <= expectedRwaAmount - accumulatedRwaAmount, "Pool: insufficient RWA available");
        
        uint256 holdAmount = rwaAmount * fixedMintPrice;
        fee = (holdAmount * entryFeePercent) / 10000;
        requiredHold = holdAmount + fee;
    }

    /// @notice Calculates HOLD return amount for burning RWA
    /// @param rwaAmount Amount of RWA tokens to burn
    /// @return returnAmount Amount of HOLD tokens to receive after fee
    /// @return fee Fee amount in HOLD tokens
    function getBurnReturn(uint256 rwaAmount) public view returns (uint256 returnAmount, uint256 fee) {
        uint256 userShare = (rwaAmount * availableReturnBalance) / awaitingRwaAmount;
        fee = (userShare * exitFeePercent) / 10000;
        returnAmount = userShare - fee;
    }

    /// @notice Mints RWA tokens in exchange for HOLD tokens
    /// @param maxRwaAmount Maximum amount of RWA tokens to receive
    /// @param minRwaAmount Minimum acceptable amount of RWA tokens
    function mint(uint256 maxRwaAmount, uint256 minRwaAmount) external nonReentrant {
        require(!paused, "Pool: paused");
        require(!isTargetReached, "Pool: buying disabled after target reached");
        require(block.timestamp <= entryPeriodExpired, "Pool: entry period expired");
        require(accumulatedRwaAmount < expectedRwaAmount, "Pool: no RWA tokens available");
        require(minRwaAmount > 0 && minRwaAmount <= maxRwaAmount, "Pool: invalid RWA amounts");

        
        uint256 rwaAmount = maxRwaAmount > (expectedRwaAmount - accumulatedRwaAmount) ? (expectedRwaAmount - accumulatedRwaAmount) : maxRwaAmount;
        require(rwaAmount >= minRwaAmount, "Pool: insufficient RWA available");

        
        (uint256 requiredHold, uint256 fee) = getMintCost(rwaAmount);

        
        require(
            holdToken.transferFrom(msg.sender, address(this), requiredHold),
            "Pool: transfer failed"
        );

        
        address treasury = address(addressBook.treasury());
        require(holdToken.transfer(treasury, fee), "Pool: fee transfer failed");

        
        accumulatedHoldAmount += requiredHold - fee;
        accumulatedRwaAmount += rwaAmount;
        awaitingRwaAmount += rwaAmount;

        
        addressBook.eventEmitter().emitPool_AccumulatedAmountsUpdated(
            entityId,
            accumulatedHoldAmount,
            accumulatedRwaAmount
        );
        
        
        rwa.mint(msg.sender, tokenId, rwaAmount);

        
        if (accumulatedHoldAmount == expectedHoldAmount) {
            isTargetReached = true;
            allocatedHoldAmount = expectedHoldAmount;
            
            
            addressBook.eventEmitter().emitPool_TargetReached(
                entityId,
                allocatedHoldAmount
            );
        }
    }

    /// @notice Burns RWA tokens in exchange for HOLD tokens
    /// @param rwaAmount Amount of RWA tokens to burn
    /// @param minHoldAmount Minimum amount of HOLD tokens to receive
    function burn(uint256 rwaAmount, uint256 minHoldAmount) external nonReentrant {
        require(!paused, "Pool: paused");
        require(rwaAmount > 0, "Pool: zero amount");
        
        
        require(
            block.timestamp > completionPeriodExpired || isFullyReturned,
            "Pool: completion period not expired and not fully returned"
        );

        
        require(availableReturnBalance > 0, "Pool: no available funds for return");

        
        (uint256 holdAmount, uint256 fee) = getBurnReturn(rwaAmount);
        require(holdAmount >= minHoldAmount, "Pool: insufficient output amount");
        
        
        rwa.burn(msg.sender, tokenId, rwaAmount);
        require(holdToken.transfer(msg.sender, holdAmount), "Pool: transfer failed");

        
        address treasury = address(addressBook.treasury());
        require(holdToken.transfer(treasury, fee), "Pool: fee transfer failed");

        
        availableReturnBalance -= holdAmount;
        awaitingRwaAmount -= rwaAmount;

        
        addressBook.eventEmitter().emitPool_AvailableReturnBalanceUpdated(
            entityId,
            availableReturnBalance
        );
    }
}