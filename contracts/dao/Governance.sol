// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { AddressBook } from "../system/AddressBook.sol";
import { DaoStaking } from "./DaoStaking.sol";

/// @title DAO Governance Contract
/// @notice Manages proposal creation and voting
contract Governance is UUPSUpgradeable {
    /// @notice Address book contract reference
    AddressBook public addressBook;
    
    /// @notice Proposal state enum
    enum ProposalState {
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Executed
    }

    /// @notice Proposal information
    /// @param proposer Address who created proposal
    /// @param targets Target addresses for calls
    /// @param values ETH values for calls
    /// @param calldatas Calldata for calls
    /// @param description Proposal description
    /// @param startTime Timestamp when voting starts
    /// @param endTime Timestamp when voting ends
    /// @param forVotes Amount of votes for proposal
    /// @param againstVotes Amount of votes against proposal
    /// @param executed Whether proposal was executed
    /// @param canceled Whether proposal was canceled
    struct Proposal {
        address proposer;
        address[] targets;
        uint256[] values;
        bytes[] calldatas;
        string description;
        uint256 startTime;
        uint256 endTime;
        uint256 forVotes;
        uint256 againstVotes;
        bool executed;
        bool canceled;
    }

    /// @notice Voting receipt for a voter
    struct Receipt {
        bool hasVoted;
        bool support;
        uint256 votes;
    }

    /// @notice Minimum votes required to create proposal
    uint256 public proposalThreshold;
    
    /// @notice Minimum percentage of total voting power that must vote for proposal to succeed
    uint256 public quorumNumerator;
    
    /// @notice Time delay before voting starts after proposal creation
    uint256 public votingDelay;
    
    /// @notice Duration of voting period
    uint256 public votingPeriod;

    /// @notice Mapping from proposal ID to proposal
    mapping(uint256 => Proposal) public proposals;
    
    /// @notice Mapping from proposal ID to voter address to receipt
    mapping(uint256 => mapping(address => Receipt)) public receipts;
    
    /// @notice Counter for proposal IDs
    uint256 public proposalCount;

    /// @notice Constructor that disables initializers
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    function initialize(
        address initialAddressBook,
        uint256 initialProposalThreshold,
        uint256 initialQuorumNumerator,
        uint256 initialVotingDelay,
        uint256 initialVotingPeriod
    ) external initializer {
        require(initialQuorumNumerator <= 100, "Invalid quorum");
        
        __UUPSUpgradeable_init();
        addressBook = AddressBook(initialAddressBook);
        proposalThreshold = initialProposalThreshold;
        quorumNumerator = initialQuorumNumerator;
        votingDelay = initialVotingDelay;
        votingPeriod = initialVotingPeriod;
    }

    /// @notice Creates a new proposal
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) external returns (uint256) {
        DaoStaking staking = DaoStaking(addressBook.daoStaking());
        require(
            staking.getVotes(msg.sender) >= proposalThreshold,
            "Below proposal threshold"
        );
        
        require(
            targets.length == values.length &&
            targets.length == calldatas.length,
            "Invalid proposal"
        );

        uint256 proposalId = ++proposalCount;
        Proposal storage proposal = proposals[proposalId];
        
        proposal.proposer = msg.sender;
        proposal.targets = targets;
        proposal.values = values;
        proposal.calldatas = calldatas;
        proposal.description = description;
        proposal.startTime = block.timestamp + votingDelay;
        proposal.endTime = proposal.startTime + votingPeriod;

        addressBook.eventEmitter().emitGovernance_ProposalCreated(
            proposalId,
            msg.sender,
            targets,
            values,
            calldatas,
            description,
            proposal.startTime,
            proposal.endTime
        );

        return proposalId;
    }

    /// @notice Casts vote on proposal
    function castVote(uint256 proposalId, bool support) external {
        require(state(proposalId) == ProposalState.Active, "Proposal not active");
        
        Receipt storage receipt = receipts[proposalId][msg.sender];
        require(!receipt.hasVoted, "Already voted");

        DaoStaking staking = DaoStaking(addressBook.daoStaking());
        uint256 votes = staking.getVotes(msg.sender);
        require(votes > 0, "No voting power");

        receipt.hasVoted = true;
        receipt.support = support;
        receipt.votes = votes;

        if (support) {
            proposals[proposalId].forVotes += votes;
        } else {
            proposals[proposalId].againstVotes += votes;
        }

        // Extend lock period in staking contract
        staking.extendLock(msg.sender);

        addressBook.eventEmitter().emitGovernance_VoteCast(msg.sender, proposalId, support, votes);
    }

    /// @notice Executes a successful proposal
    function execute(uint256 proposalId) external payable {
        require(state(proposalId) == ProposalState.Succeeded, "Proposal not succeeded");
        
        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;

        for (uint256 i = 0; i < proposal.targets.length; i++) {
            (bool success, ) = proposal.targets[i].call{value: proposal.values[i]}(
                proposal.calldatas[i]
            );
            require(success, "Proposal execution failed");
        }

        addressBook.eventEmitter().emitGovernance_ProposalExecuted(proposalId);
    }

    /// @notice Cancels a proposal
    function cancel(uint256 proposalId) external {
        require(state(proposalId) == ProposalState.Active, "Cannot cancel");
        require(
            msg.sender == proposals[proposalId].proposer ||
            address(addressBook.timelock()) == msg.sender,
            "Not authorized"
        );

        proposals[proposalId].canceled = true;
        addressBook.eventEmitter().emitGovernance_ProposalCanceled(proposalId);
    }

    /// @notice Gets current state of proposal
    function state(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage proposal = proposals[proposalId];
        
        if (proposal.canceled) {
            return ProposalState.Canceled;
        }
        
        if (proposal.executed) {
            return ProposalState.Executed;
        }

        if (block.timestamp <= proposal.endTime) {
            return ProposalState.Active;
        }

        DaoStaking staking = DaoStaking(addressBook.daoStaking());
        uint256 totalSupply = staking.totalStaked();
        
        if (
            proposal.forVotes <= proposal.againstVotes ||
            proposal.forVotes + proposal.againstVotes < (totalSupply * quorumNumerator) / 100
        ) {
            return ProposalState.Defeated;
        }

        return ProposalState.Succeeded;
    }

    /// @notice Updates governance parameters
    function updateParams(
        uint256 newProposalThreshold,
        uint256 newQuorumNumerator,
        uint256 newVotingDelay,
        uint256 newVotingPeriod
    ) external {
        addressBook.requireTimelock(msg.sender);
        require(newQuorumNumerator <= 100, "Invalid quorum");
        
        proposalThreshold = newProposalThreshold;
        quorumNumerator = newQuorumNumerator;
        votingDelay = newVotingDelay;
        votingPeriod = newVotingPeriod;
    }

    /// @notice Authorizes upgrade
    function _authorizeUpgrade(address newImplementation) internal override {
        addressBook.requireGovernance(msg.sender);
    }
}
