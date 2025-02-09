// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { Config } from "./Config.sol";
import { DaoStaking } from "../dao/DaoStaking.sol";
import { Governance } from "../dao/Governance.sol";
import { DaoToken } from "../dao/DaoToken.sol";
import { Timelock } from "../dao/Timelock.sol";
import { Treasury } from "../dao/Treasury.sol";
import { Airdrop } from "../platform/Airdrop.sol";
import { PlatformStaking } from "../platform/PlatformStaking.sol";
import { PlatformStakingAirdrop } from "../platform/PlatformStakingAirdrop.sol";
import { PlatformToken } from "../platform/PlatformToken.sol";
import { ReferralTreasury } from "../platform/ReferralTreasury.sol";
import { Pool } from "../rwa/Pool.sol";
import { Factory } from "../rwa/Factory.sol";
import { Router } from "../rwa/Router.sol";
import { RWA } from "../rwa/RWA.sol";

/// @title AddressBook contract for managing system addresses
/// @notice This contract stores and manages addresses of core protocol contracts
/// @dev Handles setting and managing addresses for all protocol contracts
contract AddressBook is UUPSUpgradeable {
    /// @notice The governance contract address
    Governance public governance;

    /// @notice The config contract address
    Config public config;

    /// @notice The DAO token contract address
    DaoToken public daoToken;

    /// @notice The DAO staking contract address
    DaoStaking public daoStaking;

    /// @notice The timelock contract address
    Timelock public timelock;

    /// @notice The treasury contract address
    Treasury public treasury;

    /// @notice The airdrop contract address
    Airdrop public airdrop;

    /// @notice The platform staking contract address
    PlatformStaking public platformStaking;

    /// @notice The platform staking airdrop contract address
    PlatformStakingAirdrop public platformStakingAirdrop;

    /// @notice The platform token contract address
    PlatformToken public platformToken;

    /// @notice The referral treasury contract address
    ReferralTreasury public referralTreasury;

    /// @notice The factory contract address
    Factory public factory;

    /// @notice The router contract address
    Router public router;

    /// @notice The implementation contract address for RWA
    address public rwaImplementation;

    /// @notice The implementation contract address for Pool
    address public poolImplementation;

    /// @notice Array of all registered pool addresses
    Pool[] public pools;

    /// @notice Mapping to check if an address is a registered pool
    mapping(address => bool) public isPool;

    /// @notice Array of all registered RWA addresses
    RWA[] public rwas;

    /// @notice Mapping to check if an address is a registered RWA
    mapping(address => bool) public isRWA;

    /// @notice The backend EOA address
    address public backend;

    /// @notice Contract constructor
    /// @dev Disables initializers at deployment
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract setting initial governance
    /// @dev Can only be called once through initializer modifier
    function initialize() external initializer {
        __UUPSUpgradeable_init_unchained();
        governance = Governance(msg.sender);
    }

    /// @notice Authorizes an upgrade to a new implementation
    /// @dev Internal function that can only be called by governance
    /// @param newImplementation The address of the new implementation
    function _authorizeUpgrade(address newImplementation) internal override {
        requireGovernance(msg.sender);
    }

    /// @notice Checks if an address has governance rights
    /// @dev Reverts if account is not governance
    /// @param account The address to check
    function requireGovernance(address account) public view {
        require(account == address(governance), "Only Governance!");
    }

    /// @notice Checks if an address has timelock rights
    /// @dev Reverts if account is not timelock
    /// @param account The address to check
    function requireTimelock(address account) public view {
        require(account == address(timelock), "Only timelock!");
    }

    /// @notice Checks if an address has factory rights
    /// @dev Reverts if account is not factory
    /// @param account The address to check
    function requireFactory(address account) public view {
        require(account == address(factory), "Only factory!");
    }

    /// @notice Updates the governance address
    /// @dev Can only be called by current governance
    /// @param newGovernance The address of the new governance
    function setGovernance(Governance newGovernance) external {
        requireGovernance(msg.sender);
        governance = newGovernance;
    }

    /// @notice Sets the config contract address
    /// @dev Can only be called by governance
    /// @param newConfig The address of the new config contract
    function setConfig(Config newConfig) external {
        requireGovernance(msg.sender);
        config = newConfig;
    }

    /// @notice Sets the DAO token contract address
    /// @dev Can only be called by governance
    /// @param newDaoToken The address of the new DAO token contract
    function setDaoToken(DaoToken newDaoToken) external {
        requireGovernance(msg.sender);
        daoToken = newDaoToken;
    }

    /// @notice Sets the DAO staking contract address
    /// @dev Can only be called by governance
    /// @param newDaoStaking The address of the new DAO staking contract
    function setDaoStaking(DaoStaking newDaoStaking) external {
        requireGovernance(msg.sender);
        daoStaking = newDaoStaking;
    }

    /// @notice Sets the timelock contract address
    /// @dev Can only be called by governance
    /// @param newTimelock The address of the new timelock contract
    function setTimelock(Timelock newTimelock) external {
        requireGovernance(msg.sender);
        timelock = newTimelock;
    }

    /// @notice Sets the treasury contract address
    /// @dev Can only be called by governance
    /// @param newTreasury The address of the new treasury contract
    function setTreasury(Treasury newTreasury) external {
        requireGovernance(msg.sender);
        treasury = newTreasury;
    }

    /// @notice Sets the airdrop contract address
    /// @dev Can only be called by governance
    /// @param newAirdrop The address of the new airdrop contract
    function setAirdrop(Airdrop newAirdrop) external {
        requireGovernance(msg.sender);
        airdrop = newAirdrop;
    }

    /// @notice Sets the platform staking contract address
    /// @dev Can only be called by governance
    /// @param newPlatformStaking The address of the new platform staking contract
    function setPlatformStaking(PlatformStaking newPlatformStaking) external {
        requireGovernance(msg.sender);
        platformStaking = newPlatformStaking;
    }

    /// @notice Sets the platform staking airdrop contract address
    /// @dev Can only be called by governance
    /// @param newPlatformStakingAirdrop The address of the new platform staking airdrop contract
    function setPlatformStakingAirdrop(PlatformStakingAirdrop newPlatformStakingAirdrop) external {
        requireGovernance(msg.sender);
        platformStakingAirdrop = newPlatformStakingAirdrop;
    }

    /// @notice Sets the platform token contract address
    /// @dev Can only be called by governance
    /// @param newPlatformToken The address of the new platform token contract
    function setPlatformToken(PlatformToken newPlatformToken) external {
        requireGovernance(msg.sender);
        platformToken = newPlatformToken;
    }

    /// @notice Sets the referral treasury contract address
    /// @dev Can only be called by governance
    /// @param newReferralTreasury The address of the new referral treasury contract
    function setReferralTreasury(ReferralTreasury newReferralTreasury) external {
        requireGovernance(msg.sender);
        referralTreasury = newReferralTreasury;
    }

    /// @notice Sets the factory contract address
    /// @dev Can only be called by governance
    /// @param newFactory The address of the new factory contract
    function setFactory(Factory newFactory) external {
        requireGovernance(msg.sender);
        factory = newFactory;
    }

    /// @notice Sets the router contract address
    /// @dev Can only be called by governance
    /// @param newRouter The address of the new router contract
    function setRouter(Router newRouter) external {
        requireGovernance(msg.sender);
        router = newRouter;
    }

    /// @notice Sets the backend EOA address
    /// @dev Can only be called by governance
    /// @param newBackend The address of the new backend address
    function setBackend(address newBackend) external {
        requireGovernance(msg.sender);
        backend = newBackend;
    }

    /// @notice Sets the RWA implementation contract address
    /// @dev Can only be called by governance
    /// @param newImplementation The address of the new RWA implementation
    function setRWAImplementation(address newImplementation) external {
        requireGovernance(msg.sender);
        rwaImplementation = newImplementation;
    }

    /// @notice Sets the Pool implementation contract address
    /// @dev Can only be called by governance
    /// @param newImplementation The address of the new Pool implementation
    function setPoolImplementation(address newImplementation) external {
        requireGovernance(msg.sender);
        poolImplementation = newImplementation;
    }

    /// @notice Adds a new pool to the system
    /// @dev Can only be called by governance
    /// @param pool The address of the pool to add
    function addPool(Pool pool) external {
        requireGovernance(msg.sender);
        require(!isPool[address(pool)], "Pool already exists");
        pools.push(pool);
        isPool[address(pool)] = true;
    }

    /// @notice Adds a new RWA to the system
    /// @dev Can only be called by governance
    /// @param rwa The address of the RWA to add
    function addRWA(RWA rwa) external {
        requireGovernance(msg.sender);
        require(!isRWA[address(rwa)], "RWA already exists");
        rwas.push(rwa);
        isRWA[address(rwa)] = true;
    }
}
