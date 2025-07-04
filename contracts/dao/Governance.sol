// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import { UpgradeableContract } from "../utils/UpgradeableContract.sol";
import { AddressBook } from "../system/AddressBook.sol";
import { Config } from "../system/Config.sol";
import { EventEmitter } from "../system/EventEmitter.sol";
import { DaoStaking } from "./DaoStaking.sol";

/// @title DAO Governance Contract
/// @notice Simple governance with instant proposals and automatic execution/cancellation
contract Governance is UpgradeableContract, ReentrancyGuardUpgradeable {
    AddressBook public addressBook;
    uint256 public proposalCount;

    struct Proposal {
        address proposer;
        address target;
        bytes data;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 endTime;
        bool executed;
        bool cancelled;
    }

    struct Receipt {
        bool hasVoted;
        bool support;
        uint256 votes;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => Receipt)) public receipts;

    constructor() UpgradeableContract() {}

    function initialize(address initialAddressBook) external initializer {
        require(initialAddressBook != address(0), "Invalid address book");
        addressBook = AddressBook(initialAddressBook);
        __UpgradeableContract_init();
        __ReentrancyGuard_init();
    }

    /// @notice Creates proposal with instant start
    function propose(
        address target,
        bytes memory data,
        string memory description
    ) external returns (uint256 proposalId) {
        Config config = addressBook.config();
        DaoStaking daoStaking = addressBook.daoStaking();

        require(target != address(0), "Invalid target");
        require(bytes(description).length > 0, "Empty description");
        require(
            daoStaking.getVotingPower(msg.sender) >= config.proposalThreshold(),
            "Insufficient voting power"
        );

        proposalId = ++proposalCount;
        uint256 endTime = block.timestamp + config.votingPeriod();

        proposals[proposalId] = Proposal({
            proposer: msg.sender,
            target: target,
            data: data,
            description: description,
            votesFor: 0,
            votesAgainst: 0,
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
            block.timestamp,
            endTime
        );
    }

    /// @notice Vote and auto-execute/cancel
    function vote(uint256 proposalId, bool support, string memory reason) external nonReentrant {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal");
        
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed && !proposal.cancelled, "Proposal finished");
        require(block.timestamp <= proposal.endTime, "Voting ended");

        Receipt storage receipt = receipts[proposalId][msg.sender];
        require(!receipt.hasVoted, "Already voted");

        DaoStaking daoStaking = addressBook.daoStaking();
        uint256 votes = daoStaking.getVotingPower(msg.sender);
        require(votes > 0, "No voting power");

        // Record vote
        receipt.hasVoted = true;
        receipt.support = support;
        receipt.votes = votes;

        if (support) {
            proposal.votesFor += votes;
        } else {
            proposal.votesAgainst += votes;
        }

        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDAO_VoteCast(proposalId, msg.sender, support, votes, reason);

        // Check for auto-execution or cancellation
        _checkAutoAction(proposalId);
    }

    /// @notice Manual cancel by proposer
    function cancel(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(
            msg.sender == proposal.proposer || msg.sender == address(this),
            "Not authorized"
        );
        require(!proposal.executed && !proposal.cancelled, "Proposal finished");

        _cancelProposal(proposalId, msg.sender);
    }

    /// @notice Get proposal info
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal");
        return proposals[proposalId];
    }

    /// @notice Get vote receipt
    function getReceipt(uint256 proposalId, address voter) external view returns (Receipt memory) {
        return receipts[proposalId][voter];
    }

    /// @notice Check if proposal is active
    function isActive(uint256 proposalId) external view returns (bool) {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal");
        Proposal storage proposal = proposals[proposalId];
        return !proposal.executed && !proposal.cancelled && block.timestamp <= proposal.endTime;
    }

    /// @notice Private cancel logic (reusable)
    function _cancelProposal(uint256 proposalId, address canceller) private {
        proposals[proposalId].cancelled = true;
        EventEmitter eventEmitter = addressBook.eventEmitter();
        eventEmitter.emitDAO_ProposalCancelled(proposalId, canceller);
    }

    /// @notice Check and execute auto-actions after vote
    function _checkAutoAction(uint256 proposalId) private {
        Proposal storage proposal = proposals[proposalId];

        // Skip if already finished
        if (proposal.executed || proposal.cancelled) {
            return;
        }

        Config config = addressBook.config();
        DaoStaking daoStaking = addressBook.daoStaking();
        
        uint256 totalVotingPower = daoStaking.getTotalVotingPower();
        uint256 quorum = (totalVotingPower * config.quorumPercentage()) / 10000;

        // Execute if enough votes FOR
        if (proposal.votesFor >= quorum && proposal.votesFor > proposal.votesAgainst) {
            (bool success, bytes memory returnData) = proposal.target.call(proposal.data);
            require(success, _getRevertMsg(returnData));

            proposal.executed = true;
            EventEmitter eventEmitter = addressBook.eventEmitter();
            eventEmitter.emitDAO_ProposalExecuted(proposalId, address(this));
            return;
        }

        // Cancel if enough votes AGAINST
        if (proposal.votesAgainst >= quorum && proposal.votesAgainst > proposal.votesFor) {
            _cancelProposal(proposalId, address(this));
        }
    }

    function uniqueContractId() public pure override returns (bytes32) {
        return keccak256("Governance");
    }

    function implementationVersion() public pure override returns (uint256) {
        return 1;
    }

    function _verifyAuthorizeUpgradeRole() internal view override {
        addressBook.requireTimelock(msg.sender);
    }

    function _getRevertMsg(bytes memory returnData) private pure returns (string memory) {
        if (returnData.length < 68) return "Transaction reverted silently";
        assembly {
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string));
    }
}
