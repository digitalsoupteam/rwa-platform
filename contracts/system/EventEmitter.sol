// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "./AddressBook.sol";

contract EventEmitter is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    // DaoStaking Events
    event DaoStaking_Staked(address indexed emittedFrom, address indexed user, uint256 amount);
    event DaoStaking_Unstaked(address indexed emittedFrom, address indexed user, uint256 amount);
    event DaoStaking_LockExtended(address indexed emittedFrom, address indexed user, uint256 lockUntil);

    // Governance Events
    event Governance_ProposalCreated(
        address indexed emittedFrom,
        uint256 indexed proposalId,
        address indexed proposer,
        address[] targets,
        uint256[] values,
        bytes[] calldatas,
        string description,
        uint256 startTime,
        uint256 endTime
    );
    event Governance_VoteCast(
        address indexed emittedFrom,
        address indexed voter,
        uint256 indexed proposalId,
        bool support,
        uint256 votes
    );
    event Governance_ProposalExecuted(address indexed emittedFrom, uint256 indexed proposalId);
    event Governance_ProposalCanceled(address indexed emittedFrom, uint256 indexed proposalId);

    // Timelock Events
    event Timelock_OperationScheduled(
        address indexed emittedFrom,
        bytes32 indexed operationId,
        address indexed target,
        uint256 value,
        bytes data,
        uint256 timestamp
    );
    event Timelock_OperationExecuted(address indexed emittedFrom, bytes32 indexed operationId);
    event Timelock_OperationCanceled(address indexed emittedFrom, bytes32 indexed operationId);

    // Treasury Events
    event Treasury_Withdrawn(address indexed emittedFrom, address indexed token, address indexed to, uint256 amount);
    event Treasury_ETHReceived(address indexed emittedFrom, address indexed from, uint256 amount);

    // Factory Events
    event Factory_RWADeployed(address indexed emittedFrom, address indexed token, address indexed owner);
    event Factory_PoolDeployed(
        address indexed emittedFrom,
        address indexed pool,
        address indexed owner,
        address rwa,
        uint256 rwaId
    );

    // Pool Events
    event Pool_Swap(address indexed emittedFrom, address indexed sender, uint256 holdAmount, uint256 rwaAmount, bool isRWAIn);
    event Pool_EmergencyStop(address indexed emittedFrom, bool paused);
    event Pool_FeesCollected(address indexed emittedFrom, uint256 amount, address treasury);
    event Pool_ProductOwnerBalanceUpdated(address indexed emittedFrom, uint256 newBalance);
    event Pool_ReservesUpdated(address indexed emittedFrom, uint256 realHold, uint256 virtualHold, uint256 virtualRwa);
    event Pool_InvestmentRepaid(address indexed emittedFrom, uint256 amount);
    event Pool_ProfitDistributed(address indexed emittedFrom, address indexed user, uint256 amount);
    event Pool_TargetReached(address indexed emittedFrom, uint256 timestamp);

    // Router Events
    event Router_SwapExactInput(
        address indexed emittedFrom,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address pool
    );
    event Router_SwapExactOutput(
        address indexed emittedFrom,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address pool
    );

    // Token Events
    event DaoToken_Transfer(address indexed emittedFrom, address indexed from, address indexed to, uint256 amount);
    event PlatformToken_Transfer(address indexed emittedFrom, address indexed from, address indexed to, uint256 amount);
    event RWA_Transfer(address indexed emittedFrom, address indexed from, address indexed to, uint256 tokenId, uint256 amount);

    // Config Events
    event Config_InvestmentDurationUpdated(address indexed emittedFrom, uint256 minDuration, uint256 maxDuration);
    event Config_RealiseDurationUpdated(address indexed emittedFrom, uint256 minDuration, uint256 maxDuration);
    event Config_TargetAmountUpdated(address indexed emittedFrom, uint256 minAmount, uint256 maxAmount);
    event Config_VirtualMultiplierUpdated(address indexed emittedFrom, uint256 multiplier);
    event Config_ProfitPercentUpdated(address indexed emittedFrom, uint256 minPercent, uint256 maxPercent);
    event Config_MinPartialReturnUpdated(address indexed emittedFrom, uint256 amount);
    event Config_HoldTokenUpdated(address indexed emittedFrom, IERC20 token);
    event Config_CreationFeesUpdated(address indexed emittedFrom, uint256 rwaFee, uint256 poolFee);
    event Config_TradingFeesUpdated(address indexed emittedFrom, uint256 buyFee, uint256 sellFee);
    event Config_RWAInitialSupplyUpdated(address indexed emittedFrom, uint256 supply);
    event Config_MinSignersRequiredUpdated(address indexed emittedFrom, uint256 minSignersRequired);

    // DaoStaking Functions
    function emitDaoStaking_Staked(address user, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DaoStaking_Staked(msg.sender, user, amount);
    }

    function emitDaoStaking_Unstaked(address user, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DaoStaking_Unstaked(msg.sender, user, amount);
    }

    function emitDaoStaking_LockExtended(address user, uint256 lockUntil) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DaoStaking_LockExtended(msg.sender, user, lockUntil);
    }

    // Governance Functions
    function emitGovernance_ProposalCreated(
        uint256 proposalId,
        address proposer,
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata calldatas,
        string calldata description,
        uint256 startTime,
        uint256 endTime
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Governance_ProposalCreated(
            msg.sender,
            proposalId,
            proposer,
            targets,
            values,
            calldatas,
            description,
            startTime,
            endTime
        );
    }

    function emitGovernance_VoteCast(
        address voter,
        uint256 proposalId,
        bool support,
        uint256 votes
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Governance_VoteCast(msg.sender, voter, proposalId, support, votes);
    }

    function emitGovernance_ProposalExecuted(uint256 proposalId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Governance_ProposalExecuted(msg.sender, proposalId);
    }

    function emitGovernance_ProposalCanceled(uint256 proposalId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Governance_ProposalCanceled(msg.sender, proposalId);
    }

    // Timelock Functions
    function emitTimelock_OperationScheduled(
        bytes32 operationId,
        address target,
        uint256 value,
        bytes calldata data,
        uint256 timestamp
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Timelock_OperationScheduled(msg.sender, operationId, target, value, data, timestamp);
    }

    function emitTimelock_OperationExecuted(bytes32 operationId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Timelock_OperationExecuted(msg.sender, operationId);
    }

    function emitTimelock_OperationCanceled(bytes32 operationId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Timelock_OperationCanceled(msg.sender, operationId);
    }

    // Treasury Functions
    function emitTreasury_Withdrawn(address token, address to, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Treasury_Withdrawn(msg.sender, token, to, amount);
    }

    function emitTreasury_ETHReceived(address from, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Treasury_ETHReceived(msg.sender, from, amount);
    }

    // Factory Functions
    function emitFactory_RWADeployed(address token, address owner) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Factory_RWADeployed(msg.sender, token, owner);
    }

    function emitFactory_PoolDeployed(
        address pool,
        address owner,
        address rwa,
        uint256 rwaId
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Factory_PoolDeployed(msg.sender, pool, owner, rwa, rwaId);
    }

    // Pool Functions
    function emitPool_Swap(
        address sender,
        uint256 holdAmount,
        uint256 rwaAmount,
        bool isRWAIn
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_Swap(msg.sender, sender, holdAmount, rwaAmount, isRWAIn);
    }

    function emitPool_EmergencyStop(bool paused) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_EmergencyStop(msg.sender, paused);
    }

    function emitPool_FeesCollected(uint256 amount, address treasury) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_FeesCollected(msg.sender, amount, treasury);
    }

    function emitPool_ProductOwnerBalanceUpdated(uint256 newBalance) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_ProductOwnerBalanceUpdated(msg.sender, newBalance);
    }

    function emitPool_ReservesUpdated(
        uint256 realHold,
        uint256 virtualHold,
        uint256 virtualRwa
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_ReservesUpdated(msg.sender, realHold, virtualHold, virtualRwa);
    }

    function emitPool_InvestmentRepaid(uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_InvestmentRepaid(msg.sender, amount);
    }

    function emitPool_ProfitDistributed(address user, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_ProfitDistributed(msg.sender, user, amount);
    }

    function emitPool_TargetReached(uint256 timestamp) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_TargetReached(msg.sender, timestamp);
    }

    // Router Functions
    function emitRouter_SwapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address pool
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Router_SwapExactInput(msg.sender, tokenIn, tokenOut, amountIn, amountOut, pool);
    }

    function emitRouter_SwapExactOutput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address pool
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Router_SwapExactOutput(msg.sender, tokenIn, tokenOut, amountIn, amountOut, pool);
    }

    // Config Functions
    function emitConfig_InvestmentDurationUpdated(
        uint256 minDuration,
        uint256 maxDuration
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_InvestmentDurationUpdated(msg.sender, minDuration, maxDuration);
    }

    function emitConfig_RealiseDurationUpdated(uint256 minDuration, uint256 maxDuration) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_RealiseDurationUpdated(msg.sender, minDuration, maxDuration);
    }

    function emitConfig_TargetAmountUpdated(uint256 minAmount, uint256 maxAmount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_TargetAmountUpdated(msg.sender, minAmount, maxAmount);
    }

    function emitConfig_VirtualMultiplierUpdated(uint256 multiplier) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_VirtualMultiplierUpdated(msg.sender, multiplier);
    }

    function emitConfig_ProfitPercentUpdated(uint256 minPercent, uint256 maxPercent) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_ProfitPercentUpdated(msg.sender, minPercent, maxPercent);
    }

    function emitConfig_MinPartialReturnUpdated(uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_MinPartialReturnUpdated(msg.sender, amount);
    }

    function emitConfig_HoldTokenUpdated(IERC20 token) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_HoldTokenUpdated(msg.sender, token);
    }

    function emitConfig_CreationFeesUpdated(uint256 rwaFee, uint256 poolFee) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_CreationFeesUpdated(msg.sender, rwaFee, poolFee);
    }

    function emitConfig_TradingFeesUpdated(uint256 buyFee, uint256 sellFee) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_TradingFeesUpdated(msg.sender, buyFee, sellFee);
    }

    function emitConfig_RWAInitialSupplyUpdated(uint256 supply) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_RWAInitialSupplyUpdated(msg.sender, supply);
    }

    function emitConfig_MinSignersRequiredUpdated(uint256 minSignersRequired) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_MinSignersRequiredUpdated(msg.sender, minSignersRequired);
    }

    // Payment Functions
    event Payment_Processed(address indexed emittedFrom, address indexed user, address indexed token, uint256 amount, string userId);

    function emitPayment_Processed(address user, address token, uint256 amount, string calldata userId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Payment_Processed(msg.sender, user, token, amount, userId);
    }

    uint256 public genesisBlock;

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init_unchained();

        require(initialAddressBook != address(0), "Invalid address book");
        addressBook = AddressBook(initialAddressBook);
        genesisBlock = block.number;
    }

    // Token Functions
    function emitDaoToken_Transfer(address from, address to, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DaoToken_Transfer(msg.sender, from, to, amount);
    }

    function emitPlatformToken_Transfer(address from, address to, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit PlatformToken_Transfer(msg.sender, from, to, amount);
    }

    function emitRWA_Transfer(address from, address to, uint256 tokenId, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit RWA_Transfer(msg.sender, from, to, tokenId, amount);
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.requireGovernance(msg.sender);
    }
}
