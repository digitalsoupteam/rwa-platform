// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";

import { Config } from "./Config.sol";
import { EventEmitter } from "./EventEmitter.sol";
import { DaoStaking } from "../dao/DaoStaking.sol";
import { Governance } from "../dao/Governance.sol";
import { Timelock } from "../dao/Timelock.sol";
import { Treasury } from "../dao/Treasury.sol";
import { PlatformToken } from "../platform/PlatformToken.sol";
import { ReferralTreasury } from "../platform/ReferralTreasury.sol";
import { Factory } from "../rwa/Factory.sol";
// import { Router } from "../rwa/Router.sol";
import { RWA } from "../rwa/RWA.sol";
import { Pool } from "../rwa/Pool.sol";

/// @title AddressBook contract for managing system addresses
/// @notice This contract stores and manages addresses of core protocol contracts
/// @dev Handles setting and managing addresses for all protocol contracts
contract AddressBook is UpgradeableContract {
    /// @notice The governance contract address
    Governance public governance;

    /// @notice The config contract address
    Config public config;

    /// @notice The eventEmitter contract address
    EventEmitter public eventEmitter;

    /// @notice The DAO staking contract address
    DaoStaking public daoStaking;

    /// @notice The timelock contract address
    Timelock public timelock;

    /// @notice The treasury contract address
    Treasury public treasury;

    /// @notice The platform token contract address
    PlatformToken public platformToken;

    /// @notice The referral treasury contract address
    ReferralTreasury public referralTreasury;

    /// @notice The factory contract address
    Factory public factory;

    // /// @notice The router contract address
    // Router public router;

    /// @notice The implementation contract address for RWA
    address public rwaImplementation;

    /// @notice The implementation contract address for Speculation Pool
    address public poolImplementation;

    /// @notice Array of all registered pools
    Pool[] internal pools;

    /// @notice Mapping to check if an address is a registered speculation pool
    mapping(address => bool) public isPool;

    /// @notice Array of all registered RWA addresses
    RWA[] internal rwas;

    /// @notice Mapping to check if an address is a registered RWA
    mapping(address => bool) public isRWA;

    /// @notice Mapping to check if an address is a registered protocol contract
    mapping(address => bool) public isProtocolContract;

    /// @notice Mapping to track authorized signers
    mapping(address => bool) public signers;

    /// @notice Number of authorized signers
    uint256 public signersLength;

    /// @notice The upgrade role address
    address public upgradeRole;

    constructor() UpgradeableContract() {}

    /// @notice Initializes the contract setting initial governance
    /// @dev Can only be called once through initializer modifier
    function initialize() external initializer {
        __UpgradeableContract_init();
        governance = Governance(msg.sender);
        timelock = Timelock(payable(msg.sender));
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("AddressBook");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        requireUpgradeRole(msg.sender);
    }

    /// @notice Checks if an address has governance rights
    /// @dev Reverts if account is not governance
    /// @param account The address to check
    function requireGovernance(address account) public view {
        require(account == address(governance), "AddressBook: not governance");
    }

    /// @notice Checks if an address has timelock rights
    /// @dev Reverts if account is not timelock
    /// @param account The address to check
    function requireTimelock(address account) public view {
        require(account == address(timelock), "Only timelock!");
    }

    /// @notice Checks if an address has upgradeRole rights
    /// @dev Reverts if account is not upgradeRole
    /// @param account The address to check
    function requireUpgradeRole(address account) public view {
        require(account == upgradeRole, "Only upgradeRole!");
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
        if (address(governance) != address(0)) {
            isProtocolContract[address(governance)] = false;
        }
        governance = newGovernance;
        isProtocolContract[address(newGovernance)] = true;
    }

    /// @notice Sets the config contract address
    /// @dev Can only be called by governance
    /// @param newConfig The address of the new config contract
    function setConfig(Config newConfig) external {
        requireGovernance(msg.sender);
        if (address(config) != address(0)) {
            isProtocolContract[address(config)] = false;
        }
        config = newConfig;
        isProtocolContract[address(newConfig)] = true;
    }

    /// @notice Sets the DAO staking contract address
    /// @dev Can only be called by governance
    /// @param newDaoStaking The address of the new DAO staking contract
    function setDaoStaking(DaoStaking newDaoStaking) external {
        requireGovernance(msg.sender);
        if (address(daoStaking) != address(0)) {
            isProtocolContract[address(daoStaking)] = false;
        }
        daoStaking = newDaoStaking;
        isProtocolContract[address(newDaoStaking)] = true;
    }

    /// @notice Sets the timelock contract address
    /// @dev Can only be called by governance
    /// @param newTimelock The address of the new timelock contract
    function setTimelock(Timelock newTimelock) external {
        requireGovernance(msg.sender);
        if (address(timelock) != address(0)) {
            isProtocolContract[address(timelock)] = false;
        }
        timelock = newTimelock;
        isProtocolContract[address(newTimelock)] = true;
    }

    /// @notice Sets the treasury contract address
    /// @dev Can only be called by governance
    /// @param newTreasury The address of the new treasury contract
    function setTreasury(Treasury newTreasury) external {
        requireGovernance(msg.sender);
        if (address(treasury) != address(0)) {
            isProtocolContract[address(treasury)] = false;
        }
        treasury = newTreasury;
        isProtocolContract[address(newTreasury)] = true;
    }

    /// @notice Sets the platform token contract address
    /// @dev Can only be called by governance
    /// @param newPlatformToken The address of the new platform token contract
    function setPlatformToken(PlatformToken newPlatformToken) external {
        requireGovernance(msg.sender);
        if (address(platformToken) != address(0)) {
            isProtocolContract[address(platformToken)] = false;
        }
        platformToken = newPlatformToken;
        isProtocolContract[address(newPlatformToken)] = true;
    }

    /// @notice Sets the referral treasury contract address
    /// @dev Can only be called by governance
    /// @param newReferralTreasury The address of the new referral treasury contract
    function setReferralTreasury(ReferralTreasury newReferralTreasury) external {
        requireGovernance(msg.sender);
        if (address(referralTreasury) != address(0)) {
            isProtocolContract[address(referralTreasury)] = false;
        }
        referralTreasury = newReferralTreasury;
        isProtocolContract[address(newReferralTreasury)] = true;
    }

    /// @notice Sets the factory contract address
    /// @dev Can only be called by governance
    /// @param newFactory The address of the new factory contract
    function setFactory(Factory newFactory) external {
        requireGovernance(msg.sender);
        if (address(factory) != address(0)) {
            isProtocolContract[address(factory)] = false;
        }
        factory = newFactory;
        isProtocolContract[address(newFactory)] = true;
    }

    /// @notice Adds a new signer
    /// @dev Can only be called by governance
    /// @param newSigner The address of the new signer to add
    function addSigner(address newSigner) external {
        requireGovernance(msg.sender);
        require(newSigner != address(0), "Invalid signer address");
        require(!signers[newSigner], "Signer already exists");
        
        signers[newSigner] = true;
        signersLength++;
    }

    /// @notice Removes an existing signer
    /// @dev Can only be called by governance
    /// @param signer The address of the signer to remove
    function removeSigner(address signer) external {
        requireGovernance(msg.sender);
        require(signers[signer], "Signer does not exist");
        
        signers[signer] = false;
        signersLength--;
    }

    /// @notice Checks if an address is an authorized signer
    /// @dev Reverts if account is not a signer
    /// @param account The address to check
    function requireSigner(address account) public view {
        require(signers[account], "Not an authorized signer!");
    }

    /// @notice Sets the event emitter contract address
    /// @dev Can only be called by governance
    /// @param newEventEmitter The address of the new event emitter contract
    function setEventEmitter(EventEmitter newEventEmitter) external {
        requireGovernance(msg.sender);
        eventEmitter = newEventEmitter;
    }

    /// @notice Sets the RWA implementation contract address
    /// @dev Can only be called by governance
    /// @param newImplementation The address of the new RWA implementation
    function setRWAImplementation(address newImplementation) external {
        requireGovernance(msg.sender);
        rwaImplementation = newImplementation;
    }

    /// @notice Sets the Speculation Pool implementation contract address
    /// @dev Can only be called by governance
    /// @param newImplementation The address of the new Speculation Pool implementation
    function setPoolImplementation(address newImplementation) external {
        requireGovernance(msg.sender);
        poolImplementation = newImplementation;
    }

    /// @notice Checks if an address is a registered protocol contract
    /// @dev Reverts if account is not a protocol contract
    /// @param account The address to check
    function requireProtocolContract(address account) public view {
        require(isProtocolContract[account], "Not a protocol contract!");
    }

    /// @notice Adds a new  pool to the system
    /// @dev Can only be called by factory
    /// @param pool The address of the pool to add
    function addPool(Pool pool) external {
        requireFactory(msg.sender);
        require(!isPool[address(pool)], "Pool already exists");
        pools.push(pool);
        isPool[address(pool)] = true;
        isProtocolContract[address(pool)] = true;
    }

    /// @notice Adds a new RWA to the system
    /// @dev Can only be called by governance
    /// @param rwa The address of the RWA to add
    function addRWA(RWA rwa) external {
        require(msg.sender == address(factory), "Only factory!");
        require(!isRWA[address(rwa)], "RWA already exists");
        rwas.push(rwa);
        isRWA[address(rwa)] = true;
        isProtocolContract[address(rwa)] = true;
    }

    /// @notice Returns pool at specific index
    /// @param index Index of the pool to return
    /// @return BasePool Pool at specified index
    function getPoolByIndex(uint256 index) external view returns(Pool) {
        require(index < pools.length, "Index out of bounds");
        return pools[index];
    }

    /// @notice Returns RWA at specific index
    /// @param index Index of the RWA to return
    /// @return RWA RWA at specified index
    function getRWAByIndex(uint256 index) external view returns(RWA) {
        require(index < rwas.length, "Index out of bounds");
        return rwas[index];
    }

    /// @notice Returns the number of registered RWAs
    /// @return uint256 Number of registered RWAs
    function rwasLength() external view returns(uint256) {
        return rwas.length;
    }

    /// @notice Returns the number of registered pools
    /// @return uint256 Number of registered pools
    function poolsLength() external view returns(uint256) {
        return pools.length;
    }
}
