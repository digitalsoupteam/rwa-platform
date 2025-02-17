// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RWA } from "./RWA.sol";
import { AddressBook } from "../system/AddressBook.sol";
import "hardhat/console.sol";
/// @title Pool
/// @notice Pool for swapping between HOLD token (ERC20) and RWA token (ERC1155)
/// @dev Implements AMM functionality with staking mechanism for RWA tokens and profit distribution
contract Pool is UUPSUpgradeable, ReentrancyGuardUpgradeable {
    /// @notice Governance and configuration management
    AddressBook public addressBook;

    /// @notice HOLD token contract
    IERC20 public holdToken;

    /// @notice Address of RWA token contract
    RWA public rwa;

    /// @notice ID of RWA token used in this pool
    uint256 public tokenId;

    /// @notice Current amount of real HOLD tokens in pool
    uint256 public realHoldReserve;

    /// @notice Virtual amount of HOLD tokens in pool
    uint256 public virtualHoldReserve;

    /// @notice Virtual amount of RWA tokens in pool
    uint256 public virtualRwaReserve;

    /// @notice Fee percent for buy operations (e.g. 30 = 3%)
    uint256 public buyFeePercent;

    /// @notice Fee percent for sell operations (e.g. 30 = 3%)
    uint256 public sellFeePercent;

    /// @notice Target amount to raise in HOLD
    uint256 public targetAmount;

    /// @notice Profit percent (e.g. 200 = 20%)
    uint256 public profitPercent;

    /// @notice Investment period expiration timestamp
    uint256 public investmentExpired;

    /// @notice Realise period expiration timestamp
    uint256 public realiseExpired;

    /// @notice Amount available for product owner to withdraw
    uint256 public productOwnerBalance;

    /// @notice Total profit amount that should be returned to the pool
    uint256 public totalProfitRequired;

    /// @notice Amount of profit repaid by product owner
    uint256 public profitRepaid;

    /// @notice Amount of profit distributed to users
    uint256 public profitDistributed;

    /// @notice Amount of investment repaid by product owner
    uint256 public repaidAmount;

    /// @notice Emergency stop flag
    bool public paused;

    /// @notice Can buy tokens after strike
    bool public speculationsEnabled;

    bool public isStriked;

    uint256 public k;

    /// @notice Emitted when tokens are swapped
    /// @param sender Address performing the swap
    /// @param holdAmount Amount of HOLD tokens
    /// @param rwaAmount Amount of RWA tokens
    /// @param isRWAIn Direction of swap
    event Swap(address indexed sender, uint256 holdAmount, uint256 rwaAmount, bool isRWAIn);

    /// @notice Emitted when emergency stop is triggered
    /// @param paused New pause state
    event EmergencyStop(bool paused);

    /// @notice Emitted when fees are collected
    /// @param amount Amount of fees collected
    /// @param treasury Address of treasury receiving fees
    event FeesCollected(uint256 amount, address treasury);

    /// @notice Emitted when product owner balance is updated
    /// @param newBalance New balance available for withdrawal
    event ProductOwnerBalanceUpdated(uint256 newBalance);

    /// @notice Emitted when reserves are updated
    /// @param realHold New real HOLD reserve
    /// @param virtualHold New virtual HOLD reserve
    /// @param virtualRwa New virtual RWA reserve
    event ReservesUpdated(uint256 realHold, uint256 virtualHold, uint256 virtualRwa);

    /// @notice Emitted when investment is repaid
    /// @param amount Amount repaid
    event InvestmentRepaid(uint256 amount);

    /// @notice Emitted when profit is distributed
    /// @param user Bonus recipient
    /// @param amount Amount of profit distributed
    event ProfitDistributed(address indexed user, uint256 amount);

    event TargetReached(uint256 timestamp);

    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the pool
    /// @param initialAddressBook Address of AddressBook contract
    /// @param initialHoldToken Address of HOLD token
    /// @param initialRwa Address of RWA token
    /// @param initialTokenId ID of RWA token
    /// @param intialBuyFeePercent Fee percent for buying RWA
    /// @param intialSellFeePercent Fee percent for selling RWA
    /// @param intialVirtualHoldReserve Initial virtual HOLD reserve
    /// @param intialVirtualRwaReserve Initial virtual RWA reserve
    /// @param intialTargetAmount Target amount to raise
    /// @param intialProfitPercent Expected profit percent
    /// @param intialInvestmentExpired Investment period expiration
    /// @param intialRealiseExpired Realise period expiration
    /// @param initialSpeculationsEnabled Can buy tokens after strike
    function initialize(
        address initialAddressBook,
        address initialHoldToken,
        address initialRwa,
        uint256 initialTokenId,
        uint256 intialBuyFeePercent,
        uint256 intialSellFeePercent,
        uint256 intialVirtualHoldReserve,
        uint256 intialVirtualRwaReserve,
        uint256 intialTargetAmount,
        uint256 intialProfitPercent,
        uint256 intialInvestmentExpired,
        uint256 intialRealiseExpired,
        bool initialSpeculationsEnabled
    ) external initializer {
        require(initialAddressBook != address(0), "Zero address book");
        require(initialHoldToken != address(0), "Zero hold token");
        require(initialRwa != address(0), "Zero RWA token");
        require(intialInvestmentExpired > block.timestamp, "Invalid investment expiry");
        require(intialRealiseExpired > intialInvestmentExpired, "Invalid realise expiry");

        __UUPSUpgradeable_init_unchained();
        __ReentrancyGuard_init_unchained();

        addressBook = AddressBook(initialAddressBook);
        holdToken = IERC20(initialHoldToken);
        rwa = RWA(initialRwa);
        tokenId = initialTokenId;
        buyFeePercent = intialBuyFeePercent;
        sellFeePercent = intialSellFeePercent;
        virtualHoldReserve = intialVirtualHoldReserve;
        virtualRwaReserve = intialVirtualRwaReserve;
        targetAmount = intialTargetAmount;
        profitPercent = intialProfitPercent;
        investmentExpired = intialInvestmentExpired;
        realiseExpired = intialRealiseExpired;

        totalProfitRequired = (intialTargetAmount * intialProfitPercent) / 10000;
        speculationsEnabled = initialSpeculationsEnabled;

        k = intialVirtualRwaReserve * intialVirtualHoldReserve;
    }

    function validateTrading(bool isRWAIn) public view {
        require(!paused, "Pool: paused");

        if (!isRWAIn) {
            require(block.timestamp <= realiseExpired, "Pool: realise period expired");
        }

        if (!isRWAIn && block.timestamp > investmentExpired) {
            require(isStriked, "Pool: investment target not reached");
        }

        if (!speculationsEnabled && isStriked) {
            if (block.timestamp > investmentExpired && block.timestamp <= realiseExpired) {
                revert("Pool: trading locked until realise period");
            }
        }
    }

    /// @notice Calculates output amount for swap
    /// @param amountIn Amount being swapped in
    /// @param isRWAIn True if input is RWA token
    /// @return Amount of tokens to receive
    function getAmountOut(uint256 amountIn, bool isRWAIn) external view returns (uint256) {
        require(amountIn > 0, "Pool: insufficient input amount");

        uint256 inputReserve = isRWAIn ? virtualRwaReserve : virtualHoldReserve + realHoldReserve;
        uint256 outputReserve = isRWAIn ? virtualHoldReserve + realHoldReserve : virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "Pool: insufficient liquidity");

        uint256 newOutputReserve = k / (inputReserve + amountIn);
        uint256 amountOutWithoutFee = outputReserve - newOutputReserve;

        require(amountOutWithoutFee < outputReserve, "Pool: insufficient output reserve");

        if (isRWAIn) {
            uint256 fee = amountOutWithoutFee * sellFeePercent / 10000;
            return amountOutWithoutFee - fee;
        } else {
            return amountOutWithoutFee;
        }
    }

    /// @notice Calculates required input amount for desired output
    /// @param amountOut Desired output amount
    /// @param isRWAIn True if input is RWA token
    /// @return Required input amount
    function getAmountIn(uint256 amountOut, bool isRWAIn) external view returns (uint256) {
        require(amountOut > 0, "Pool: insufficient output amount");

        uint256 inputReserve = isRWAIn ? virtualRwaReserve : virtualHoldReserve + realHoldReserve;
        uint256 outputReserve = isRWAIn ? virtualHoldReserve + realHoldReserve : virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "Pool: insufficient liquidity");
        require(amountOut < outputReserve, "Pool: insufficient output reserve");

        uint256 newInputReserve = k / (outputReserve - amountOut);
        uint256 amountInWithoutFee = newInputReserve - inputReserve;

        if (isRWAIn) {
            return amountInWithoutFee;
        } else {
            return (amountInWithoutFee * (10000 + buyFeePercent)) / 10000;
        }
    }

    function getBonusAmount(uint256 rwaAmount) external view returns (uint256) {
        if (block.timestamp > realiseExpired) {
            uint256 _profitRepaid = profitRepaid;
            uint256 _profitDistributed = profitDistributed;
            if (_profitRepaid > _profitDistributed) {
                uint256 availableBonus = _profitRepaid - _profitDistributed;
                uint256 calculatedBonus = (rwaAmount * totalProfitRequired) / 1_000_000;
                return calculatedBonus < availableBonus ? calculatedBonus : availableBonus;
            }
        }
        return 0;
    }

    function swapExactInput(
        uint256 amountIn,
        uint256 minAmountOut,
        bool isRWAIn
    ) external nonReentrant returns (uint256 amountOut) {
        validateTrading(isRWAIn);
        require(amountIn > 0, "Pool: insufficient input amount");

        uint256 _realHoldReserve = realHoldReserve;
        uint256 _virtualHoldReserve = virtualHoldReserve;
        uint256 _virtualRwaReserve = virtualRwaReserve;
        IERC20 _holdToken = holdToken;

        uint256 inputReserve = isRWAIn
            ? _virtualRwaReserve
            : _virtualHoldReserve + _realHoldReserve;
        uint256 outputReserve = isRWAIn
            ? _virtualHoldReserve + _realHoldReserve
            : _virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "Pool: insufficient liquidity");

        uint256 newOutputReserve = k / (inputReserve + amountIn);
        uint256 amountOutWithoutFee = outputReserve - newOutputReserve;

        require(amountOutWithoutFee < outputReserve, "Pool: insufficient output reserve");

        uint256 feeAmount;

        if (isRWAIn) {
            // Selling RWA for HOLD
            feeAmount = (amountOutWithoutFee * sellFeePercent) / 10000;
            amountOut = amountOutWithoutFee - feeAmount;

            require(amountOut >= minAmountOut, "Pool: insufficient output amount");
            require(amountOut <= _realHoldReserve, "Pool: insufficient real hold");

            _virtualRwaReserve += amountIn;
            _realHoldReserve -= amountOutWithoutFee;

            rwa.burn(msg.sender, tokenId, amountIn);
            require(_holdToken.transfer(msg.sender, amountOut), "Pool: transfer failed");

            if (block.timestamp > realiseExpired) {
                uint256 _profitRepaid = profitRepaid;
                uint256 _profitDistributed = profitDistributed;
                if (_profitRepaid > _profitDistributed) {
                    uint256 availableBonus = _profitRepaid - _profitDistributed;
                    uint256 calculatedBonus = (amountIn * totalProfitRequired) / 1_000_000;
                    uint256 bonus = calculatedBonus < availableBonus
                        ? calculatedBonus
                        : availableBonus;
                    if (bonus > 0) {
                        require(
                            _holdToken.transfer(msg.sender, bonus),
                            "Pool: bonus transfer failed"
                        );
                        profitDistributed += bonus;
                        emit ProfitDistributed(msg.sender, bonus);
                    }
                }
            }
        } else {
            // Buying RWA with HOLD
            amountOut = amountOutWithoutFee;
            require(amountOut >= minAmountOut, "Pool: insufficient output amount");

            feeAmount = (amountIn * buyFeePercent) / 10000;
            uint256 totalRequired = amountIn + feeAmount;

            _realHoldReserve += amountIn;
            _virtualRwaReserve -= amountOut;

            amountIn = totalRequired;

            require(
                _holdToken.transferFrom(msg.sender, address(this), totalRequired),
                "Pool: transfer from failed"
            );
            rwa.mint(msg.sender, tokenId, amountOut);

            if (block.timestamp <= investmentExpired) {
                uint256 _targetAmount = targetAmount;
                if (_realHoldReserve >= _targetAmount) {
                    isStriked = true;
                    emit TargetReached(block.timestamp);
                    productOwnerBalance = _targetAmount;
                    _virtualHoldReserve += _targetAmount;
                    _realHoldReserve -= _targetAmount;
                    emit ProductOwnerBalanceUpdated(_targetAmount);
                }
            }
        }

        address treasury = address(addressBook.treasury());
        require(_holdToken.transfer(treasury, feeAmount), "Pool: fee transfer failed");
        emit FeesCollected(feeAmount, treasury);

        realHoldReserve = _realHoldReserve;
        virtualHoldReserve = _virtualHoldReserve;
        virtualRwaReserve = _virtualRwaReserve;

        emit Swap(
            msg.sender,
            isRWAIn ? amountOut : amountIn,
            isRWAIn ? amountIn : amountOut,
            isRWAIn
        );
        emit ReservesUpdated(_realHoldReserve, _virtualHoldReserve, _virtualRwaReserve);

        return amountOut;
    }

    function swapExactOutput(
        uint256 amountOut,
        uint256 maxAmountIn,
        bool isRWAIn
    ) external nonReentrant returns (uint256 amountIn) {
        validateTrading(isRWAIn);
        require(amountOut > 0, "Pool: insufficient output amount");

        uint256 _realHoldReserve = realHoldReserve;
        uint256 _virtualHoldReserve = virtualHoldReserve;
        uint256 _virtualRwaReserve = virtualRwaReserve;
        IERC20 _holdToken = holdToken;

        uint256 inputReserve = isRWAIn
            ? _virtualRwaReserve
            : _virtualHoldReserve + _realHoldReserve;
        uint256 outputReserve = isRWAIn
            ? _virtualHoldReserve + _realHoldReserve
            : _virtualRwaReserve;

        uint256 feeAmount;

        require(inputReserve > 0 && outputReserve > 0, "Pool: insufficient liquidity");

        if (isRWAIn) {
            // Selling RWA for HOLD
            feeAmount = (amountOut * sellFeePercent) / 10000;
            uint256 totalOutput = amountOut + feeAmount;

            require(totalOutput < outputReserve, "Pool: insufficient output reserve");
            require(totalOutput <= _realHoldReserve, "Pool: insufficient real hold");

            uint256 newInputReserve = k / (outputReserve - totalOutput);
            amountIn = newInputReserve - inputReserve;

            require(amountIn <= maxAmountIn, "Pool: excessive input amount");

            _virtualRwaReserve += amountIn;
            _realHoldReserve -= totalOutput;

            rwa.burn(msg.sender, tokenId, amountIn);
            require(_holdToken.transfer(msg.sender, amountOut), "Pool: transfer failed");

            if (block.timestamp > realiseExpired) {
                uint256 _profitRepaid = profitRepaid;
                uint256 _profitDistributed = profitDistributed;
                if (_profitRepaid > _profitDistributed) {
                    uint256 availableBonus = _profitRepaid - _profitDistributed;
                    uint256 calculatedBonus = (amountIn * totalProfitRequired) / 1_000_000;
                    uint256 bonus = calculatedBonus < availableBonus
                        ? calculatedBonus
                        : availableBonus;
                    if (bonus > 0) {
                        require(
                            _holdToken.transfer(msg.sender, bonus),
                            "Pool: bonus transfer failed"
                        );
                        profitDistributed += bonus;
                        emit ProfitDistributed(msg.sender, bonus);
                    }
                }
            }
        } else {
            // Buying RWA with HOLD
            require(amountOut < outputReserve, "Pool: insufficient output reserve");

            uint256 newInputReserve = k / (outputReserve - amountOut);
            amountIn = newInputReserve - inputReserve;

            feeAmount = (amountIn * buyFeePercent) / 10000;
            uint256 totalRequired = amountIn + feeAmount;

            require(totalRequired <= maxAmountIn, "Pool: excessive input amount");

            _realHoldReserve += amountIn;
            _virtualRwaReserve -= amountOut;

            amountIn = totalRequired;

            require(
                _holdToken.transferFrom(msg.sender, address(this), totalRequired),
                "Pool: transfer from failed"
            );
            rwa.mint(msg.sender, tokenId, amountOut);

            if (block.timestamp <= investmentExpired) {
                uint256 _targetAmount = targetAmount;
                if (_realHoldReserve >= _targetAmount) {
                    isStriked = true;
                    emit TargetReached(block.timestamp);
                    productOwnerBalance = _targetAmount;
                    _virtualHoldReserve += _targetAmount;
                    _realHoldReserve -= _targetAmount;
                    emit ProductOwnerBalanceUpdated(_targetAmount);
                }
            }
        }

        address treasury = address(addressBook.treasury());
        require(_holdToken.transfer(treasury, feeAmount), "Pool: fee transfer failed");
        emit FeesCollected(feeAmount, treasury);

        realHoldReserve = _realHoldReserve;
        virtualHoldReserve = _virtualHoldReserve;
        virtualRwaReserve = _virtualRwaReserve;

        emit Swap(
            msg.sender,
            isRWAIn ? amountOut : amountIn,
            isRWAIn ? amountIn : amountOut,
            isRWAIn
        );
        emit ReservesUpdated(_realHoldReserve, _virtualHoldReserve, _virtualRwaReserve);

        return amountIn;
    }

    /// @notice Allows product owner to repay investment and profit
    /// @param amount Amount to repay
    function repayInvestment(uint256 amount) external nonReentrant {
        require(msg.sender == rwa.productOwner(), "Pool: only product owner");
        require(isStriked, "Pool: not striked");
        require(amount > 0, "Pool: invalid amount");

        require(
            holdToken.transferFrom(msg.sender, address(this), amount),
            "Pool: repay transfer failed"
        );

        uint256 totalRequired = targetAmount + totalProfitRequired;
        uint256 totalRemaining = totalRequired - repaidAmount - profitRepaid;
        require(amount <= totalRemaining, "Pool: excess repayment");

        uint256 targetRemaining = targetAmount - repaidAmount;
        uint256 toTarget = 0;

        if (targetRemaining > 0) {
            toTarget = amount > targetRemaining ? targetRemaining : amount;
            repaidAmount += toTarget;

            uint256 remaining = amount - toTarget;
            if (remaining > 0) {
                profitRepaid += remaining;
            }
        } else {
            profitRepaid += amount;
        }

        realHoldReserve += amount;
        if (virtualHoldReserve >= amount) {
            virtualHoldReserve -= amount;
        }

        emit InvestmentRepaid(amount);
        emit ReservesUpdated(realHoldReserve, virtualHoldReserve, virtualRwaReserve);
    }

    /// @notice Allows product owner to claim raised funds
    function claimProductOwnerBalance() external nonReentrant {
        require(msg.sender == rwa.productOwner(), "Pool: only product owner");
        require(productOwnerBalance > 0, "Pool: no balance");

        uint256 amount = productOwnerBalance;
        productOwnerBalance = 0;
        require(holdToken.transfer(msg.sender, amount), "Pool: claim transfer failed");

        emit ProductOwnerBalanceUpdated(0);
    }

    /// @notice Sets emergency pause state
    /// @param state New pause state
    function setPause(bool state) external {
        addressBook.requireGovernance(msg.sender);
        paused = state;
        emit EmergencyStop(state);
    }

    /// @notice Authorizes contract upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
