// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AddressBook } from "./AddressBook.sol";

contract EventEmitter is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    // DaoStaking Events
    event DaoStaking_Staked(address indexed user, uint256 amount);
    event DaoStaking_Unstaked(address indexed user, uint256 amount);
    event DaoStaking_LockExtended(address indexed user, uint256 lockUntil);

    // Governance Events
    event Governance_ProposalCreated(
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
        address indexed voter,
        uint256 indexed proposalId,
        bool support,
        uint256 votes
    );
    event Governance_ProposalExecuted(uint256 indexed proposalId);
    event Governance_ProposalCanceled(uint256 indexed proposalId);

    // Timelock Events
    event Timelock_OperationScheduled(
        bytes32 indexed operationId,
        address indexed target,
        uint256 value,
        bytes data,
        uint256 timestamp
    );
    event Timelock_OperationExecuted(bytes32 indexed operationId);
    event Timelock_OperationCanceled(bytes32 indexed operationId);

    // Treasury Events
    event Treasury_Withdrawn(address indexed token, address indexed to, uint256 amount);
    event Treasury_ETHReceived(address indexed from, uint256 amount);

    // Factory Events
    event Factory_RWADeployed(address indexed token, address indexed owner);
    event Factory_PoolDeployed(
        address indexed pool,
        address indexed owner,
        address indexed rwa,
        uint256 rwaId
    );

    // Pool Events
    event Pool_Swap(address indexed sender, uint256 holdAmount, uint256 rwaAmount, bool isRWAIn);
    event Pool_EmergencyStop(bool paused);
    event Pool_FeesCollected(uint256 amount, address treasury);
    event Pool_ProductOwnerBalanceUpdated(uint256 newBalance);
    event Pool_ReservesUpdated(uint256 realHold, uint256 virtualHold, uint256 virtualRwa);
    event Pool_InvestmentRepaid(uint256 amount);
    event Pool_ProfitDistributed(address indexed user, uint256 amount);
    event Pool_TargetReached(uint256 timestamp);

    // Router Events
    event Router_SwapExactInput(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed pool
    );
    event Router_SwapExactOutput(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed pool
    );

    // Token Events
    event DaoToken_Transfer(address indexed from, address indexed to, uint256 amount);
    event PlatformToken_Transfer(address indexed from, address indexed to, uint256 amount);
    event RWA_Transfer(address indexed from, address indexed to, uint256 indexed tokenId, uint256 amount);

    // Config Events
    event Config_InvestmentDurationUpdated(uint256 minDuration, uint256 maxDuration);
    event Config_RealiseDurationUpdated(uint256 minDuration, uint256 maxDuration);
    event Config_TargetAmountUpdated(uint256 minAmount, uint256 maxAmount);
    event Config_VirtualMultiplierUpdated(uint256 multiplier);
    event Config_ProfitPercentUpdated(uint256 minPercent, uint256 maxPercent);
    event Config_MinPartialReturnUpdated(uint256 amount);
    event Config_HoldTokenUpdated(IERC20 token);
    event Config_CreationFeesUpdated(uint256 rwaFee, uint256 poolFee);
    event Config_TradingFeesUpdated(uint256 buyFee, uint256 sellFee);
    event Config_RWAInitialSupplyUpdated(uint256 supply);

    // DaoStaking Functions
    function emitDaoStaking_Staked(address user, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DaoStaking_Staked(user, amount);
    }

    function emitDaoStaking_Unstaked(address user, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DaoStaking_Unstaked(user, amount);
    }

    function emitDaoStaking_LockExtended(address user, uint256 lockUntil) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DaoStaking_LockExtended(user, lockUntil);
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
        emit Governance_VoteCast(voter, proposalId, support, votes);
    }

    function emitGovernance_ProposalExecuted(uint256 proposalId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Governance_ProposalExecuted(proposalId);
    }

    function emitGovernance_ProposalCanceled(uint256 proposalId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Governance_ProposalCanceled(proposalId);
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
        emit Timelock_OperationScheduled(operationId, target, value, data, timestamp);
    }

    function emitTimelock_OperationExecuted(bytes32 operationId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Timelock_OperationExecuted(operationId);
    }

    function emitTimelock_OperationCanceled(bytes32 operationId) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Timelock_OperationCanceled(operationId);
    }

    // Treasury Functions
    function emitTreasury_Withdrawn(address token, address to, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Treasury_Withdrawn(token, to, amount);
    }

    function emitTreasury_ETHReceived(address from, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Treasury_ETHReceived(from, amount);
    }

    // Factory Functions
    function emitFactory_RWADeployed(address token, address owner) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Factory_RWADeployed(token, owner);
    }

    function emitFactory_PoolDeployed(
        address pool,
        address owner,
        address rwa,
        uint256 rwaId
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Factory_PoolDeployed(pool, owner, rwa, rwaId);
    }

    // Pool Functions
    function emitPool_Swap(
        address sender,
        uint256 holdAmount,
        uint256 rwaAmount,
        bool isRWAIn
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_Swap(sender, holdAmount, rwaAmount, isRWAIn);
    }

    function emitPool_EmergencyStop(bool paused) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_EmergencyStop(paused);
    }

    function emitPool_FeesCollected(uint256 amount, address treasury) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_FeesCollected(amount, treasury);
    }

    function emitPool_ProductOwnerBalanceUpdated(uint256 newBalance) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_ProductOwnerBalanceUpdated(newBalance);
    }

    function emitPool_ReservesUpdated(
        uint256 realHold,
        uint256 virtualHold,
        uint256 virtualRwa
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_ReservesUpdated(realHold, virtualHold, virtualRwa);
    }

    function emitPool_InvestmentRepaid(uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_InvestmentRepaid(amount);
    }

    function emitPool_ProfitDistributed(address user, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_ProfitDistributed(user, amount);
    }

    function emitPool_TargetReached(uint256 timestamp) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Pool_TargetReached(timestamp);
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
        emit Router_SwapExactInput(tokenIn, tokenOut, amountIn, amountOut, pool);
    }

    function emitRouter_SwapExactOutput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address pool
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Router_SwapExactOutput(tokenIn, tokenOut, amountIn, amountOut, pool);
    }

    // Config Functions
    function emitConfig_InvestmentDurationUpdated(
        uint256 minDuration,
        uint256 maxDuration
    ) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_InvestmentDurationUpdated(minDuration, maxDuration);
    }

    function emitConfig_RealiseDurationUpdated(uint256 minDuration, uint256 maxDuration) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_RealiseDurationUpdated(minDuration, maxDuration);
    }

    function emitConfig_TargetAmountUpdated(uint256 minAmount, uint256 maxAmount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_TargetAmountUpdated(minAmount, maxAmount);
    }

    function emitConfig_VirtualMultiplierUpdated(uint256 multiplier) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_VirtualMultiplierUpdated(multiplier);
    }

    function emitConfig_ProfitPercentUpdated(uint256 minPercent, uint256 maxPercent) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_ProfitPercentUpdated(minPercent, maxPercent);
    }

    function emitConfig_MinPartialReturnUpdated(uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_MinPartialReturnUpdated(amount);
    }

    function emitConfig_HoldTokenUpdated(IERC20 token) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_HoldTokenUpdated(token);
    }

    function emitConfig_CreationFeesUpdated(uint256 rwaFee, uint256 poolFee) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_CreationFeesUpdated(rwaFee, poolFee);
    }

    function emitConfig_TradingFeesUpdated(uint256 buyFee, uint256 sellFee) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_TradingFeesUpdated(buyFee, sellFee);
    }

    function emitConfig_RWAInitialSupplyUpdated(uint256 supply) external {
        addressBook.requireProtocolContract(msg.sender);
        emit Config_RWAInitialSupplyUpdated(supply);
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialAddressBook) external initializer {
        __UUPSUpgradeable_init_unchained();

        require(initialAddressBook != address(0), "Invalid address book");
        addressBook = AddressBook(initialAddressBook);
    }

    // Token Functions
    function emitDaoToken_Transfer(address from, address to, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit DaoToken_Transfer(from, to, amount);
    }

    function emitPlatformToken_Transfer(address from, address to, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit PlatformToken_Transfer(from, to, amount);
    }

    function emitRWA_Transfer(address from, address to, uint256 tokenId, uint256 amount) external {
        addressBook.requireProtocolContract(msg.sender);
        emit RWA_Transfer(from, to, tokenId, amount);
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.requireGovernance(msg.sender);
    }
}
