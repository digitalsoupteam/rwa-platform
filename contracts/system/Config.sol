// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "./AddressBook.sol";

/// @title Configuration contract for RWA protocol
/// @notice Stores all configurable parameters for the protocol
/// @dev Upgradeable contract using UUPS proxy pattern
contract Config is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Minimum target amount for RWA pools
    uint256 public minTargetAmount;
    
    /// @notice Maximum target amount for RWA pools
    uint256 public maxTargetAmount;
    
    /// @notice Minimum profit percentage
    uint256 public minProfitPercent;
    
    /// @notice Maximum profit percentage 
    uint256 public maxProfitPercent;
    
    /// @notice Minimum duration for invest phase
    uint256 public minInvestmentDuration;
    
    /// @notice Maximum duration for invest phase
    uint256 public maxInvestmentDuration;

    /// @notice Minimum duration for realise phase
    uint256 public minRealiseDuration;
    
    /// @notice Maximum duration for realise phase
    uint256 public maxRealiseDuration;
    
    /// @notice Virtual multiplier for calculations
    uint256 public virtualMultiplier;
    
    /// @notice Minimum partial return amount
    uint256 public minPartialReturn;
    
    /// @notice Token used for holding
    IERC20 public holdToken;

    /// @notice Fee for creating RWA
    uint256 public createRWAFee; // todo -> %
    
    /// @notice Fee for creating pool
    uint256 public createPoolFee; // todo -> %

    /// @notice Percentage fee for buying
    uint256 public buyFeePercent;
    
    /// @notice Percentage fee for selling
    uint256 public sellFeePercent;

    /// @notice Initial supply of RWA tokens
    uint256 public rwaInitialSupply;

    // Events
    event InvestmentDurationUpdated(uint256 minDuration, uint256 maxDuration);
    event RealiseDurationUpdated(uint256 minDuration, uint256 maxDuration);
    event TargetAmountUpdated(uint256 minAmount, uint256 maxAmount);
    event VirtualMultiplierUpdated(uint256 multiplier);
    event ProfitPercentUpdated(uint256 minPercent, uint256 maxPercent);
    event MinPartialReturnUpdated(uint256 amount);
    event HoldTokenUpdated(IERC20 token);
    event CreationFeesUpdated(uint256 rwaFee, uint256 poolFee);
    event TradingFeesUpdated(uint256 buyFee, uint256 sellFee);
    event RWAInitialSupplyUpdated(uint256 supply);

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    /// @param _minTargetAmount Minimum target amount for RWA pools
    /// @param _maxTargetAmount Maximum target amount for RWA pools
    /// @param _minProfitPercent Minimum profit percentage
    /// @param _maxProfitPercent Maximum profit percentage
    /// @param _minInvestmentDuration Minimum investment duration
    /// @param _maxInvestmentDuration Maximum investment duration
    /// @param _minRealiseDuration Minimum realise duration
    /// @param _maxRealiseDuration Maximum realise duration
    /// @param _virtualMultiplier Virtual multiplier
    /// @param _minPartialReturn Minimum partial return
    /// @param _holdToken Hold token address
    /// @param _createRWAFee RWA creation fee
    /// @param _createPoolFee Pool creation fee
    /// @param intialBuyFeePercent Buy fee percentage
    /// @param intialSellFeePercent Sell fee percentage
    /// @param _rwaInitialSupply Initial RWA token supply
    function initialize(
        address initialAddressBook,
        uint256 _minTargetAmount,
        uint256 _maxTargetAmount,
        uint256 _minProfitPercent,
        uint256 _maxProfitPercent,
        uint256 _minInvestmentDuration,
        uint256 _maxInvestmentDuration,
        uint256 _minRealiseDuration,
        uint256 _maxRealiseDuration,
        uint256 _virtualMultiplier,
        uint256 _minPartialReturn,
        address _holdToken,
        uint256 _createRWAFee,
        uint256 _createPoolFee,
        uint256 intialBuyFeePercent,
        uint256 intialSellFeePercent,
        uint256 _rwaInitialSupply
    ) external initializer {
        __UUPSUpgradeable_init_unchained();
        
        require(initialAddressBook != address(0), "Invalid address book");
        require(_minTargetAmount < _maxTargetAmount, "Invalid target amount");
        require(_minProfitPercent < _maxProfitPercent, "Invalid profit percent");
        require(_minInvestmentDuration < _maxInvestmentDuration, "Invalid investment duration");
        require(_minRealiseDuration < _maxRealiseDuration, "Invalid realise duration");
        require(_virtualMultiplier > 0, "Invalid multiplier");
        require(_minPartialReturn > 0, "Invalid min partial return");
        require(_holdToken != address(0), "Invalid hold token");
        require(intialBuyFeePercent <= 100 && intialSellFeePercent <= 100, "Invalid fee percent");
        require(_rwaInitialSupply > 0, "Invalid initial supply");

        addressBook = AddressBook(initialAddressBook);
        minTargetAmount = _minTargetAmount;
        maxTargetAmount = _maxTargetAmount;
        minProfitPercent = _minProfitPercent;
        maxProfitPercent = _maxProfitPercent;
        minInvestmentDuration = _minInvestmentDuration;
        maxInvestmentDuration = _maxInvestmentDuration;
        minRealiseDuration = _minRealiseDuration;
        maxRealiseDuration = _maxRealiseDuration;
        virtualMultiplier = _virtualMultiplier;
        minPartialReturn = _minPartialReturn;
        holdToken = IERC20(_holdToken);
        createRWAFee = _createRWAFee;
        createPoolFee = _createPoolFee;
        buyFeePercent = intialBuyFeePercent;
        sellFeePercent = intialSellFeePercent;
        rwaInitialSupply = _rwaInitialSupply;
    }

    /// @notice Authorizes an upgrade to a new implementation
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }

    /// @notice Updates target amount parameters
    /// @param newMinTargetAmount New minimum target amount
    /// @param newMaxTargetAmount New maximum target amount
    function updateTargetAmount(
        uint256 newMinTargetAmount,
        uint256 newMaxTargetAmount
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinTargetAmount < newMaxTargetAmount, "Invalid target amount");
        minTargetAmount = newMinTargetAmount;
        maxTargetAmount = newMaxTargetAmount;
        emit TargetAmountUpdated(newMinTargetAmount, newMaxTargetAmount);
    }

    /// @notice Updates virtual multiplier
    /// @param newVirtualMultiplier New virtual multiplier value
    function updateVirtualMultiplier(uint256 newVirtualMultiplier) external {
        addressBook.requireGovernance(msg.sender);
        require(newVirtualMultiplier > 0, "Invalid multiplier");
        virtualMultiplier = newVirtualMultiplier;
        emit VirtualMultiplierUpdated(newVirtualMultiplier);
    }

    /// @notice Updates profit percent parameters
    /// @param newMinProfitPercent New minimum profit percent
    /// @param newMaxProfitPercent New maximum profit percent 
    function updateProfitPercent(
        uint256 newMinProfitPercent,
        uint256 newMaxProfitPercent
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinProfitPercent < newMaxProfitPercent, "Invalid profit percent");
        minProfitPercent = newMinProfitPercent;
        maxProfitPercent = newMaxProfitPercent;
        emit ProfitPercentUpdated(newMinProfitPercent, newMaxProfitPercent);
    }

    /// @notice Updates investment duration parameters
    /// @param newMinInvestmentDuration New minimum investment duration
    /// @param newMaxInvestmentDuration New maximum investment duration
    function updateInvestmentDuration(
        uint256 newMinInvestmentDuration, 
        uint256 newMaxInvestmentDuration
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinInvestmentDuration < newMaxInvestmentDuration, "Invalid duration");
        minInvestmentDuration = newMinInvestmentDuration;
        maxInvestmentDuration = newMaxInvestmentDuration;
        emit InvestmentDurationUpdated(newMinInvestmentDuration, newMaxInvestmentDuration);
    }

    /// @notice Updates realise duration parameters
    /// @param newMinRealiseDuration New minimum realise duration
    /// @param newMaxRealiseDuration New maximum realise duration  
    function updateRealiseDuration(
        uint256 newMinRealiseDuration,
        uint256 newMaxRealiseDuration
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinRealiseDuration < newMaxRealiseDuration, "Invalid duration");
        minRealiseDuration = newMinRealiseDuration;
        maxRealiseDuration = newMaxRealiseDuration;
        emit RealiseDurationUpdated(newMinRealiseDuration, newMaxRealiseDuration);
    }

    /// @notice Updates minimum partial return
    /// @param newMinPartialReturn New minimum partial return value
    function updateMinPartialReturn(uint256 newMinPartialReturn) external {
        addressBook.requireGovernance(msg.sender);
        require(newMinPartialReturn > 0, "Invalid min partial return");
        minPartialReturn = newMinPartialReturn;
        emit MinPartialReturnUpdated(newMinPartialReturn);
    }

    /// @notice Updates hold token address
    /// @param newHoldToken New hold token address
    function updateHoldToken(IERC20 newHoldToken) external {
        addressBook.requireGovernance(msg.sender);
        require(address(newHoldToken) != address(0), "Invalid hold token");
        holdToken = newHoldToken;
        emit HoldTokenUpdated(newHoldToken);
    }

    /// @notice Updates creation fees
    /// @param newCreateRWAFee New RWA creation fee
    /// @param newCreatePoolFee New pool creation fee
    function updateCreationFees(
        uint256 newCreateRWAFee,
        uint256 newCreatePoolFee
    ) external {
        addressBook.requireGovernance(msg.sender);
        createRWAFee = newCreateRWAFee;
        createPoolFee = newCreatePoolFee;
        emit CreationFeesUpdated(newCreateRWAFee, newCreatePoolFee);
    }

    /// @notice Updates trading fees
    /// @param newBuyFeePercent New buy fee percentage
    /// @param newSellFeePercent New sell fee percentage 
    function updateTradingFees(
        uint256 newBuyFeePercent,
        uint256 newSellFeePercent
    ) external {
        addressBook.requireGovernance(msg.sender);
        require(newBuyFeePercent <= 100 && newSellFeePercent <= 100, "Invalid fee percent");
        buyFeePercent = newBuyFeePercent;
        sellFeePercent = newSellFeePercent;
        emit TradingFeesUpdated(newBuyFeePercent, newSellFeePercent);
    }

    /// @notice Updates the initial RWA token supply
    /// @param newInitialSupply New initial supply amount for RWA tokens
    /// @dev Can only be called by governance
    function updateRWAInitialSupply(uint256 newInitialSupply) external {
        addressBook.requireGovernance(msg.sender);
        require(newInitialSupply > 0, "Initial supply must be greater than 0");
        rwaInitialSupply = newInitialSupply;
        emit RWAInitialSupplyUpdated(newInitialSupply);
    }
}