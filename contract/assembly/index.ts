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

import { Context, logging, storage, ContractPromiseBatch, u128, base58 } from 'near-sdk-as'


export function claim(account_id: string): ContractPromiseBatch {
  const public_key = Context.senderPublicKey;
  const tokens = storage.getSome<u128>(`tokens:${public_key}`);

  // TODO: Does need explict check for keys in storage?

  const promise = ContractPromiseBatch.create(Context.contractName)
    .delete_key(base58.decode(public_key))
    .then(account_id)
    .transfer(tokens);
  addTransactions(promise, account_id);

  // TODO: Remove storage keys

  return promise;
}

function addTransactions(promise: ContractPromiseBatch, account_id: string) {
  const public_key = Context.senderPublicKey;
  const transactions = storage.getSome<TransactionRequest[]>(`txs:${public_key}`);
  transactions.forEach(tx => {
    promise.then(tx.receiver_id);
    
    tx.actions.forEach(action => {
      if (action.method_name) {
        // TODO: Substitute accountId into args.  %%ACCOUNT_ID%%
        promise.function_call(action.method_name, action.args, action.deposit, action.gas);
      } else {
        promise.transfer(action.deposit);
      }
    });
  });
}


const ACCOUNT_CREATOR_ID = 'testnet';
const CREATE_ACCOUNT_GAS: u64 = 30_000_000_000_000;

class CreateAccountArgs {
  new_account_id: string;
  new_public_key: string;
}

export function create_account_and_claim(new_account_id: string, new_public_key: string): ContractPromiseBatch {
  const public_key = Context.senderPublicKey;
  const tokens = storage.getSome<u128>(`tokens:${public_key}`);

  // TODO: Does need explict check for keys in storage?

  // const args: CreateAccountArgs = {
  //   new_account_id,
  //   new_public_key
  // };
  const promise = ContractPromiseBatch.create(ACCOUNT_CREATOR_ID)
    .function_call<CreateAccountArgs>('create_account', { new_account_id, new_public_key }, tokens, CREATE_ACCOUNT_GAS)
    .then(Context.contractName)
    .delete_key(base58.decode(public_key))
  addTransactions(promise, new_account_id);

  // TODO: Remove storage keys

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

function requireOwner() {
  assert(Context.contractName == Context.predecessor, 'can only be called by owner');
}

export function send_with_transactions(public_key: string, tokens: u128, transactions: TransactionRequest[]) {
  requireOwner();

  storage.set(`tokens:${public_key}`, tokens);
  storage.set(`txs:${public_key}`, transactions);
}