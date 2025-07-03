// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { AddressBook } from "../system/AddressBook.sol";
import { Config } from "../system/Config.sol";
import { EventEmitter } from "../system/EventEmitter.sol";
import { DaoStaking } from "./DaoStaking.sol";

/// @title DAO Governance Contract
/// @notice Manages proposal creation, voting, and execution
/// @dev Handles proposal lifecycle from creation to execution
contract Governance is UpgradeableContract, ReentrancyGuardUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;

    /// @notice Proposal counter
    uint256 public proposalCount;

    /// @notice Proposal states
    enum ProposalState {
        Pending,
        Active,
        Succeeded,
        Failed,
        Executed,
        Cancelled
    }

    /// @notice Proposal information
    struct ProposalInfo {
        address proposer;
        address target;
        bytes data;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 startTime;
        uint256 endTime;
        bool executed;
        bool cancelled;
    }

    /// @notice Vote receipt for tracking user votes
    struct Receipt {
        bool hasVoted;
        bool support;
        uint256 votes;
    }

    /// @notice Proposal information mapping
    mapping(uint256 => ProposalInfo) public proposals;

    /// @notice Vote receipts mapping: proposalId => voter => receipt
    mapping(uint256 => mapping(address => Receipt)) public receipts;

    constructor() UpgradeableContract() {}

    /// @notice Initializes the contract
    /// @param initialAddressBook Address of AddressBook contract
    function initialize(address initialAddressBook) external initializer {
        require(initialAddressBook != address(0), "Invalid address book");
        
        addressBook = AddressBook(initialAddressBook);

        __UpgradeableContract_init();
        __ReentrancyGuard_init();
    }

    /// @notice Creates a new proposal
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @param description Proposal description
    /// @return proposalId The ID of the created proposal
    function propose(
        address target,
        bytes memory data,
        string memory description
    ) external returns (uint256 proposalId) {
        Config config = addressBook.config();
        DaoStaking daoStaking = addressBook.daoStaking();
        
        require(target != address(0), "Invalid target address");
        require(bytes(description).length > 0, "Empty description");
        require(
            daoStaking.getVotingPower(msg.sender) >= config.proposalThreshold(),
            "Insufficient voting power"
        );

        proposalId = ++proposalCount;
        uint256 startTime = block.timestamp + config.votingDelay();
        uint256 endTime = startTime + config.votingPeriod();

        proposals[proposalId] = ProposalInfo({
            proposer: msg.sender,
            target: target,
            data: data,
            description: description,
            votesFor: 0,
            votesAgainst: 0,
            startTime: startTime,
            endTime: endTime,
            executed: false,
            cancelled: false
        });

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDAO_ProposalCreated(
            proposalId,
            msg.sender,
            target,
            data,
            description,
            startTime,
            endTime
        );

        return proposalId;
    }

    /// @notice Casts a vote on a proposal
    /// @param proposalId The proposal ID
    /// @param support True for support, false for against
    /// @param reason Optional reason for the vote
    function vote(
        uint256 proposalId,
        bool support,
        string memory reason
    ) external nonReentrant {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        require(state(proposalId) == ProposalState.Active, "Proposal not active");
        
        Receipt storage receipt = receipts[proposalId][msg.sender];
        require(!receipt.hasVoted, "Already voted");

        DaoStaking daoStaking = addressBook.daoStaking();
        uint256 votes = daoStaking.getVotingPower(msg.sender);
        require(votes > 0, "No voting power");

        receipt.hasVoted = true;
        receipt.support = support;
        receipt.votes = votes;

        ProposalInfo storage proposal = proposals[proposalId];
        if (support) {
            proposal.votesFor += votes;
        } else {
            proposal.votesAgainst += votes;
        }

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDAO_VoteCast(
            proposalId,
            msg.sender,
            support,
            votes,
            reason
        );
    }

    /// @notice Executes a successful proposal
    /// @param proposalId The proposal ID
    function execute(uint256 proposalId) external nonReentrant {
        require(state(proposalId) == ProposalState.Succeeded, "Proposal not succeeded");
        
        ProposalInfo storage proposal = proposals[proposalId];
        
        (bool success, bytes memory returnData) = proposal.target.call(proposal.data);
        require(success, _getRevertMsg(returnData));
        
        proposal.executed = true;

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDAO_ProposalExecuted(proposalId, msg.sender);
    }

    /// @notice Cancels a proposal
    /// @param proposalId The proposal ID
    function cancel(uint256 proposalId) external {
        ProposalInfo storage proposal = proposals[proposalId];
        require(
            msg.sender == proposal.proposer || 
            msg.sender == address(addressBook.governance()),
            "Not authorized to cancel"
        );
        require(state(proposalId) != ProposalState.Executed, "Cannot cancel executed proposal");
        
        proposal.cancelled = true;

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDAO_ProposalCancelled(proposalId, msg.sender);
    }

    /// @notice Gets the current state of a proposal
    /// @param proposalId The proposal ID
    /// @return Current proposal state
    function state(uint256 proposalId) public view returns (ProposalState) {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        
        ProposalInfo storage proposal = proposals[proposalId];
        
        if (proposal.cancelled) {
            return ProposalState.Cancelled;
        }
        
        if (proposal.executed) {
            return ProposalState.Executed;
        }
        
        if (block.timestamp < proposal.startTime) {
            return ProposalState.Pending;
        }
        
        if (block.timestamp <= proposal.endTime) {
            return ProposalState.Active;
        }
        
        Config config = addressBook.config();
        DaoStaking daoStaking = addressBook.daoStaking();
        uint256 quorum = (daoStaking.getTotalVotingPower() * config.quorumPercentage()) / 10000;
        
        if (proposal.votesFor <= proposal.votesAgainst || proposal.votesFor < quorum) {
            return ProposalState.Failed;
        }
        
        
        return ProposalState.Succeeded;
    }

    /// @notice Gets proposal information
    /// @param proposalId The proposal ID
    /// @return Proposal information struct
    function getProposal(uint256 proposalId) external view returns (ProposalInfo memory) {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal ID");
        return proposals[proposalId];
    }

    /// @notice Gets vote receipt for a user on a proposal
    /// @param proposalId The proposal ID
    /// @param voter The voter address
    /// @return Vote receipt
    function getReceipt(uint256 proposalId, address voter) external view returns (Receipt memory) {
        return receipts[proposalId][voter];
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("Governance");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireGovernance(msg.sender);
    }

    /// @notice Extracts revert message from failed call
    /// @param returnData The return data from failed call
    /// @return Revert message string
    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "Transaction reverted silently";
        
        assembly {
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string));
    }
}