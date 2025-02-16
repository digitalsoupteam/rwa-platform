// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RWA } from "./RWA.sol";
import { AddressBook } from "../system/AddressBook.sol";

/// @title Pool
/// @notice Pool for swapping between HOLD token (ERC20) and RWA token (ERC1155)
/// @dev Implements AMM functionality with staking mechanism for RWA tokens and profit distribution
contract Pool is UUPSUpgradeable, ReentrancyGuardUpgradeable {
    /// @notice Governance and configuration management
    AddressBook public addressBook;

    /// @notice Address of HOLD token contract
    address public holdToken;

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
        holdToken = initialHoldToken;
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
    function getAmountOut(uint256 amountIn, bool isRWAIn) public view returns (uint256) {
        require(amountIn > 0, "Pool: insufficient input amount");

        uint256 inputReserve = isRWAIn ? virtualRwaReserve : virtualHoldReserve + realHoldReserve;
        uint256 outputReserve = isRWAIn ? virtualHoldReserve + realHoldReserve : virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "Pool: insufficient liquidity");

        uint256 fee = 10000 - (isRWAIn ? sellFeePercent : buyFeePercent);
        uint256 amountWithFee = amountIn * fee;
        uint256 numerator = amountWithFee * outputReserve;
        uint256 denominator = (inputReserve * 10000) + amountWithFee;

        return numerator / denominator;
    }

    /// @notice Calculates required input amount for desired output
    /// @param amountOut Desired output amount
    /// @param isRWAIn True if input is RWA token
    /// @return Required input amount
    function getAmountIn(uint256 amountOut, bool isRWAIn) public view returns (uint256) {
        require(amountOut > 0, "Pool: insufficient output amount");

        uint256 inputReserve = isRWAIn ? virtualRwaReserve : virtualHoldReserve + realHoldReserve;
        uint256 outputReserve = isRWAIn ? virtualHoldReserve + realHoldReserve : virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "Pool: insufficient liquidity");

        uint256 fee = 10000 - (isRWAIn ? sellFeePercent : buyFeePercent);
        uint256 numerator = inputReserve * amountOut * 10000;
        uint256 denominator = (outputReserve - amountOut) * fee;

        return (numerator / denominator) + 1;
    }

    function handleHoldSwap(address user, uint256 amountIn, uint256 amountOut) internal {
        transferHoldFromUser(user, amountIn);
        mintRwaToUser(user, amountOut);

        uint256 feeAmount = (amountIn * buyFeePercent) / 10000;
        handleFees(feeAmount);

        realHoldReserve += amountIn - feeAmount;
        virtualRwaReserve -= amountOut;

        checkAndHandleTargetReached();
    }

    function handleRwaSwap(address user, uint256 amountIn, uint256 amountOut) internal {
        uint256 availableBonus = calculateBonus(amountIn);

        burnRwaFromUser(user, amountIn);
        transferHoldToUser(user, amountOut);

        uint256 feeAmount = (amountOut * sellFeePercent) / 10000;
        handleFees(feeAmount);

        virtualRwaReserve += amountIn;
        realHoldReserve -= (amountOut + feeAmount);

        if (availableBonus > 0) {
            IERC20(holdToken).transfer(user, availableBonus);
            profitDistributed += availableBonus;
            emit ProfitDistributed(user, availableBonus);
        }
    }

    function checkAndHandleTargetReached() internal {
        if (block.timestamp <= investmentExpired && realHoldReserve >= targetAmount) {
            isStriked = true;
            emit TargetReached(block.timestamp);
            productOwnerBalance = targetAmount;
            virtualHoldReserve += targetAmount;
            realHoldReserve -= targetAmount;
            emit ProductOwnerBalanceUpdated(targetAmount);
        }
    }

    function handleSwap(address user, uint256 amountIn, uint256 amountOut, bool isRWAIn) internal {
        if (isRWAIn) {
            require(amountOut <= realHoldReserve, "Pool: insufficient real hold");
            handleRwaSwap(user, amountIn, amountOut);
        } else {
            handleHoldSwap(user, amountIn, amountOut);
        }

        emit Swap(user, isRWAIn ? amountOut : amountIn, isRWAIn ? amountIn : amountOut, isRWAIn);
        emit ReservesUpdated(realHoldReserve, virtualHoldReserve, virtualRwaReserve);
    }

    /// @notice Swaps exact input amount for output tokens
    /// @param amountIn Amount of input tokens
    /// @param minAmountOut Minimum amount of output tokens to receive
    /// @param isRWAIn True if input is RWA token
    /// @return amountOut Amount of tokens received
    function swapExactInput(
        uint256 amountIn,
        uint256 minAmountOut,
        bool isRWAIn
    ) external nonReentrant returns (uint256 amountOut) {
        validateTrading(isRWAIn);
        amountOut = getAmountOut(amountIn, isRWAIn);
        require(amountOut >= minAmountOut, "Pool: insufficient output amount");
        handleSwap(msg.sender, amountIn, amountOut, isRWAIn);
        return amountOut;
    }

    /// @notice Swaps tokens for exact output amount
    /// @param amountOut Desired amount of output tokens
    /// @param maxAmountIn Maximum input amount
    /// @param isRWAIn True if input is RWA token
    /// @return amountIn Amount of input tokens used
    function swapExactOutput(
        uint256 amountOut,
        uint256 maxAmountIn,
        bool isRWAIn
    ) external nonReentrant returns (uint256 amountIn) {
        validateTrading(isRWAIn);
        amountIn = getAmountIn(amountOut, isRWAIn);
        require(amountIn <= maxAmountIn, "Pool: excessive input amount");
        handleSwap(msg.sender, amountIn, amountOut, isRWAIn);
        return amountIn;
    }

    function calculateBonus(uint256 amount) internal view returns (uint256) {
        if (block.timestamp > realiseExpired && profitRepaid > profitDistributed) {
            uint256 availableBonus = profitRepaid - profitDistributed;
            uint256 calculatedBonus = (amount * totalProfitRequired) / 1_000_000;
            return calculatedBonus < availableBonus ? calculatedBonus : availableBonus;
        }
        return 0;
    }

    /// @notice Handles fee distribution to treasury
    /// @param amount Total fee amount
    function handleFees(uint256 amount) internal {
        address treasury = address(addressBook.treasury());
        transferHoldToUser(treasury, amount);
        emit FeesCollected(amount, treasury);
    }

    /// @notice Allows product owner to repay investment and profit
    /// @param amount Amount to repay
    function repayInvestment(uint256 amount) external nonReentrant {
        require(msg.sender == rwa.productOwner(), "Pool: only product owner");
        require(block.timestamp > investmentExpired, "Pool: investment period not expired");
        require(amount > 0, "Pool: invalid amount");

        transferHoldFromUser(msg.sender, amount);

        uint256 totalRequired = targetAmount + totalProfitRequired;
        uint256 totalRemaining = totalRequired - repaidAmount - profitRepaid;
        require(amount <= totalRemaining, "Pool: excess repayment");

        uint256 targetRemaining = targetAmount - repaidAmount;
        uint256 toTarget = 0;
        uint256 toProfit = 0;

        if (targetRemaining > 0) {
            toTarget = amount > targetRemaining ? targetRemaining : amount;
            repaidAmount += toTarget;

            uint256 remaining = amount - toTarget;
            if (remaining > 0) {
                toProfit = remaining;
                profitRepaid += remaining;
            }
        } else {
            toProfit = amount;
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
        transferHoldToUser(msg.sender, amount);

        emit ProductOwnerBalanceUpdated(0);
    }

    /// @notice Sets emergency pause state
    /// @param state New pause state
    function setPause(bool state) external {
        addressBook.requireGovernance(msg.sender);
        paused = state;
        emit EmergencyStop(state);
    }

    /// @notice Transfers HOLD tokens from user
    /// @param from Address to transfer from
    /// @param amount Amount to transfer
    function transferHoldFromUser(address from, uint256 amount) internal {
        require(
            IERC20(holdToken).transferFrom(from, address(this), amount),
            "Pool: transfer from failed"
        );
    }

    /// @notice Transfers HOLD tokens to user
    /// @param to Address to transfer to
    /// @param amount Amount to transfer
    function transferHoldToUser(address to, uint256 amount) internal {
        require(IERC20(holdToken).transfer(to, amount), "Pool: transfer failed");
    }

    /// @notice Mints RWA tokens to user
    /// @param to Address to mint to
    /// @param amount Amount to mint
    function mintRwaToUser(address to, uint256 amount) internal {
        rwa.mint(to, tokenId, amount);
    }

    /// @notice Burns RWA tokens from user
    /// @param from Address to burn from
    /// @param amount Amount to burn
    function burnRwaFromUser(address from, uint256 amount) internal {
        rwa.burn(from, tokenId, amount);
    }

    /// @notice Authorizes contract upgrade
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
