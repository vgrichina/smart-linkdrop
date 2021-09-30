/*
 * This is an example of an AssemblyScript smart contract with two simple,
 * symmetric functions:
 *
 * 1. setGreeting: accepts a greeting, such as "howdy", and records it for the
 *    user (account_id) who sent the request
 * 2. getGreeting: accepts an account_id and returns the greeting saved for it,
 *    defaulting to "Hello"
 *
 * Learn more about writing NEAR smart contracts with AssemblyScript:
 * https://docs.near.org/docs/roles/developer/contracts/assemblyscript
 *
 */

import { Context, logging, storage, ContractPromiseBatch, u128, base58, base64 } from 'near-sdk-as'

// TODO: Fix senderPublicKey (probably have either to deprecate or return raw buffer),
// as this string representation not used anywhere (has extra byte in front)
const public_key = base58.encode(base58.decode(Context.senderPublicKey).subarray(1));

export function claim(account_id: string): ContractPromiseBatch {
  const tokens = getTokens();

  const promise = ContractPromiseBatch.create(Context.contractName)
    .delete_key(base58.decode(public_key))
    .then(account_id)
    .transfer(tokens);
  addTransactions(promise, account_id);
  removeDropInfo();

  return promise;
}

function getTokens(): u128 {
  return storage.getSome<u128>(`tokens:${public_key}`);
}

function removeDropInfo(): void {
  storage.delete(`tokens:${public_key}`);
  storage.delete(`txs:${public_key}`);
}

function addTransactions(promise: ContractPromiseBatch, account_id: string): void {
  const transactions = storage.getSome<TransactionRequest[]>(`txs:${public_key}`);
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    promise.then(tx.receiver_id);
    
    for (let j = 0; j < tx.actions.length; j++) {
      const action = tx.actions[j];
      if (action.method_name) {
        // TODO: Substitute accountId into args.  %%ACCOUNT_ID%%
        promise.function_call(action.method_name, action.args, action.deposit, action.gas);
      } else {
        promise.transfer(action.deposit);
      }
    };
  };
}

const ACCOUNT_CREATOR_ID = 'testnet';
const CREATE_ACCOUNT_GAS: u64 = 50_000_000_000_000;

@nearBindgen
class CreateAccountArgs {
  new_account_id: string;
  new_public_key: string;
}

export function create_account_and_claim(new_account_id: string, new_public_key: string): ContractPromiseBatch {
  const tokens = getTokens();

  // let args: CreateAccountArgs = { new_account_id, new_public_key };
  // logging.log(`args: ${args.new_account_id} ${args.new_public_key} ${base64.encode(encode(args))} ${base64.encode(args.encode())}`);
  const promise = ContractPromiseBatch.create(ACCOUNT_CREATOR_ID)
    .function_call<CreateAccountArgs>('create_account', { new_account_id, new_public_key }, tokens, CREATE_ACCOUNT_GAS)
    .then(Context.contractName)
    .delete_key(base58.decode(public_key))
  // TODO: How to handle create_account failure?
  addTransactions(promise, new_account_id);
  removeDropInfo();

  return promise;
}


class Action {
  method_name: string;
  args: string;
  deposit: u128;
  gas: u64;
}

class TransactionRequest {
  receiver_id: string
  actions: Action[];
}

function requireOwner(): void {
  assert(Context.contractName == Context.predecessor, 'can only be called by owner');
}

export function send_with_transactions(public_key: string, tokens: u128, transactions: TransactionRequest[]): void {
  requireOwner();

  storage.set(`tokens:${public_key}`, tokens);
  storage.set(`txs:${public_key}`, transactions);
}