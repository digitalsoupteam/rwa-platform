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

    /// @notice Whether sales are enabled
    bool public salesEnabled = true;

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
    /// @param amount Amount of profit distributed
    event ProfitDistributed(uint256 amount);

    /// @notice Modifier to check if contract is not paused
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    /// @notice Returns current pool state
    /// @return _realHoldReserve Current real HOLD reserve
    /// @return intialVirtualHoldReserve Current virtual HOLD reserve
    /// @return intialVirtualRwaReserve Current virtual RWA reserve
    /// @return _salesEnabled Whether sales are enabled
    function getPoolState()
        external
        view
        returns (
            uint256 _realHoldReserve,
            uint256 intialVirtualHoldReserve,
            uint256 intialVirtualRwaReserve,
            bool _salesEnabled
        )
    {
        return (realHoldReserve, virtualHoldReserve, virtualRwaReserve, salesEnabled);
    }

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
        uint256 intialRealiseExpired
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

        totalProfitRequired = (intialTargetAmount * intialProfitPercent) / 1000;
        repaidAmount = 0;
        profitRepaid = 0;
        profitDistributed = 0;
    }

    /// @notice Calculates output amount for swap
    /// @param inputAmount Amount being swapped in
    /// @param isRWAIn True if input is RWA token
    /// @return Amount of tokens to receive
    function getAmountOut(uint256 inputAmount, bool isRWAIn) public view returns (uint256) {
        require(inputAmount > 0, "INSUFFICIENT_INPUT_AMOUNT");

        uint256 inputReserve = isRWAIn ? virtualRwaReserve : virtualHoldReserve + realHoldReserve;
        uint256 outputReserve = isRWAIn ? virtualHoldReserve + realHoldReserve : virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "INSUFFICIENT_LIQUIDITY");

        uint256 fee = 1000 - (isRWAIn ? sellFeePercent : buyFeePercent);
        uint256 inputAmountWithFee = inputAmount * fee;
        uint256 numerator = inputAmountWithFee * outputReserve;
        uint256 denominator = (inputReserve * 1000) + inputAmountWithFee;
        return numerator / denominator;
    }

    /// @notice Calculates required input amount for desired output
    /// @param outputAmount Desired output amount
    /// @param isRWAIn True if input is RWA token
    /// @return Required input amount
    function getAmountIn(uint256 outputAmount, bool isRWAIn) public view returns (uint256) {
        require(outputAmount > 0, "INSUFFICIENT_OUTPUT_AMOUNT");

        uint256 inputReserve = isRWAIn ? virtualRwaReserve : virtualHoldReserve + realHoldReserve;
        uint256 outputReserve = isRWAIn ? virtualHoldReserve + realHoldReserve : virtualRwaReserve;

        require(inputReserve > 0 && outputReserve > 0, "INSUFFICIENT_LIQUIDITY");

        uint256 fee = 1000 - (isRWAIn ? sellFeePercent : buyFeePercent);
        uint256 numerator = inputReserve * outputAmount * 1000;
        uint256 denominator = (outputReserve - outputAmount) * fee;
        return (numerator / denominator) + 1;
    }
    /// @notice Swaps exact input amount for output tokens
    /// @param exactAmountIn Amount of input tokens
    /// @param minAmountOut Minimum amount of output tokens to receive
    /// @param isRWAIn True if input is RWA token
    /// @return amountOut Amount of tokens received
    function swapExactInput(
        uint256 exactAmountIn,
        uint256 minAmountOut,
        bool isRWAIn
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        require(exactAmountIn > 0, "INSUFFICIENT_INPUT_AMOUNT");
        require(isRWAIn || salesEnabled, "SALES_DISABLED");
        require(block.timestamp <= realiseExpired, "REALISE_PERIOD_EXPIRED");

        if (isRWAIn) {
            amountOut = getAmountOut(exactAmountIn, isRWAIn);
            require(amountOut >= minAmountOut, "INSUFFICIENT_OUTPUT_AMOUNT");
            require(amountOut <= realHoldReserve, "INSUFFICIENT_REAL_HOLD");

            // Calculate available bonus
            uint256 availableBonus = 0;
            if (block.timestamp > realiseExpired && profitRepaid > profitDistributed) {
                availableBonus = profitRepaid - profitDistributed;
                uint256 calculatedBonus = (exactAmountIn * totalProfitRequired) / 1_000_000;
                if (calculatedBonus < availableBonus) {
                    availableBonus = calculatedBonus;
                }
            }

            // Execute AMM swap
            burnRwaFromUser(msg.sender, exactAmountIn);
            transferHoldToUser(msg.sender, amountOut);

            uint256 feeAmount = (amountOut * sellFeePercent) / 1000;
            handleFees(feeAmount, sellFeePercent);

            virtualRwaReserve += exactAmountIn;
            realHoldReserve -= (amountOut + feeAmount);

            // Handle bonus separately if available
            if (availableBonus > 0) {
                IERC20(holdToken).transfer(msg.sender, availableBonus);
                profitDistributed += availableBonus;
                emit ProfitDistributed(availableBonus);
            }

            emit ReservesUpdated(realHoldReserve, virtualHoldReserve, virtualRwaReserve);
        } else {
            transferHoldFromUser(msg.sender, exactAmountIn);
            mintRwaToUser(msg.sender, amountOut);

            uint256 feeAmount = (exactAmountIn * buyFeePercent) / 1000;
            handleFees(feeAmount, buyFeePercent);

            realHoldReserve += exactAmountIn - feeAmount;
            virtualRwaReserve -= amountOut;

            if (block.timestamp <= investmentExpired) {
                if (realHoldReserve >= targetAmount) {
                    productOwnerBalance = targetAmount;
                    virtualHoldReserve += targetAmount;
                    realHoldReserve -= targetAmount;
                } else if (block.timestamp == investmentExpired) {
                    salesEnabled = false;
                }
            }
        }

        emit Swap(
            msg.sender,
            isRWAIn ? amountOut : exactAmountIn,
            isRWAIn ? exactAmountIn : amountOut,
            isRWAIn
        );
    }

    /// @notice Swaps tokens for exact output amount
    /// @param exactAmountOut Desired amount of output tokens
    /// @param maxAmountIn Maximum input amount
    /// @param isRWAIn True if input is RWA token
    /// @return amountIn Amount of input tokens used
    function swapExactOutput(
        uint256 exactAmountOut,
        uint256 maxAmountIn,
        bool isRWAIn
    ) external nonReentrant whenNotPaused returns (uint256 amountIn) {
        require(exactAmountOut > 0, "INSUFFICIENT_OUTPUT_AMOUNT");
        require(isRWAIn || salesEnabled, "SALES_DISABLED");
        require(block.timestamp <= realiseExpired, "REALISE_PERIOD_EXPIRED");

        if (isRWAIn) {
            amountIn = getAmountIn(exactAmountOut, isRWAIn);
            require(amountIn <= maxAmountIn, "EXCESSIVE_INPUT_AMOUNT");
            require(exactAmountOut <= realHoldReserve, "INSUFFICIENT_REAL_HOLD");

            // Calculate available bonus
            uint256 availableBonus = 0;
            if (block.timestamp > realiseExpired && profitRepaid > profitDistributed) {
                availableBonus = profitRepaid - profitDistributed;
                uint256 calculatedBonus = (amountIn * totalProfitRequired) / 1_000_000;
                if (calculatedBonus < availableBonus) {
                    availableBonus = calculatedBonus;
                }
            }

            // Execute AMM swap
            burnRwaFromUser(msg.sender, amountIn);
            transferHoldToUser(msg.sender, exactAmountOut);

            uint256 feeAmount = (exactAmountOut * sellFeePercent) / 1000;
            handleFees(feeAmount, sellFeePercent);

            virtualRwaReserve += amountIn;
            realHoldReserve -= (exactAmountOut + feeAmount);

            // Handle bonus separately if available
            if (availableBonus > 0) {
                IERC20(holdToken).transfer(msg.sender, availableBonus);
                profitDistributed += availableBonus;
                emit ProfitDistributed(availableBonus);
            }

            emit ReservesUpdated(realHoldReserve, virtualHoldReserve, virtualRwaReserve);
        } else {
            transferHoldFromUser(msg.sender, amountIn);
            mintRwaToUser(msg.sender, exactAmountOut);

            uint256 feeAmount = (amountIn * buyFeePercent) / 1000;
            handleFees(feeAmount, buyFeePercent);

            realHoldReserve += amountIn - feeAmount;
            virtualRwaReserve -= exactAmountOut;

            if (block.timestamp <= investmentExpired) {
                if (realHoldReserve >= targetAmount) {
                    productOwnerBalance = targetAmount;
                    virtualHoldReserve += targetAmount;
                    realHoldReserve -= targetAmount;
                } else if (block.timestamp == investmentExpired) {
                    salesEnabled = false;
                }
            }
        }

        emit Swap(
            msg.sender,
            isRWAIn ? exactAmountOut : amountIn,
            isRWAIn ? amountIn : exactAmountOut,
            isRWAIn
        );
    }
    /// @notice Handles fee distribution to treasury
    /// @param feeAmount Total fee amount
    /// @param feePercent Fee percentage used (buy or sell)
    function handleFees(uint256 feeAmount, uint256 feePercent) internal {
        address _treasury = address(addressBook.treasury());
        transferHoldToUser(_treasury, feeAmount);
        emit FeesCollected(feeAmount, _treasury);
    }

    /// @notice Allows product owner to repay investment and profit
    /// @param amount Amount to repay
    function repayInvestment(uint256 amount) external nonReentrant whenNotPaused {
        require(msg.sender == rwa.productOwner(), "Only product owner!");
        require(block.timestamp > investmentExpired, "INVESTMENT_PERIOD_EXPIRED");
        require(amount > 0, "INVALID_AMOUNT");
        
        transferHoldFromUser(msg.sender, amount);

        uint256 totalRequired = targetAmount + totalProfitRequired;
        uint256 totalRemaining = totalRequired - repaidAmount - profitRepaid;
        require(amount <= totalRemaining, "EXCESS_REPAYMENT");

        // First fill target amount if needed
        uint256 targetRemaining = targetAmount - repaidAmount;
        if(targetRemaining > 0) {
            uint256 toTarget = amount > targetRemaining ? targetRemaining : amount;
            repaidAmount += toTarget;
            
            // If there's remaining after target, it goes to profit
            uint256 remainingAmount = amount - toTarget;
            if(remainingAmount > 0) {
                profitRepaid += remainingAmount;
            }
        } else {
            // All goes to profit if target is met
            profitRepaid += amount;
        }

        // Update reserves
        realHoldReserve += amount;
        if(virtualHoldReserve >= amount) {
            virtualHoldReserve -= amount;
        }

        emit InvestmentRepaid(amount);
        emit ReservesUpdated(realHoldReserve, virtualHoldReserve, virtualRwaReserve);
    }

    /// @notice Allows product owner to claim raised funds
    function claimProductOwnerBalance() external nonReentrant {
        require(msg.sender == rwa.productOwner(), "Only product owner!");
        require(productOwnerBalance > 0, "NO_BALANCE");

        uint256 amount = productOwnerBalance;
        productOwnerBalance = 0;

        transferHoldToUser(msg.sender, amount);
        emit ProductOwnerBalanceUpdated(0);
    }

    /// @notice Sets emergency pause state
    /// @param value New pause state
    function setPause(bool value) external {
        addressBook.requireGovernance(msg.sender);
        paused = value;
        emit EmergencyStop(value);
    }

    /// @notice Transfers HOLD tokens from user
    /// @param from Address to transfer from
    /// @param amount Amount to transfer
    function transferHoldFromUser(address from, uint256 amount) internal {
        require(
            IERC20(holdToken).transferFrom(from, address(this), amount),
            "HOLD_TRANSFER_FROM_FAILED"
        );
    }

    /// @notice Transfers HOLD tokens to user
    /// @param to Address to transfer to
    /// @param amount Amount to transfer
    function transferHoldToUser(address to, uint256 amount) internal {
        require(IERC20(holdToken).transfer(to, amount), "HOLD_TRANSFER_FAILED");
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
