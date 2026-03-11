/**
 * dsa_utils.cpp
 * 
 * Consolidated utility library for DSA (C++).
 * Includes: Graph Algorithms (BFS, DFS), Backtracking, Generation, and Sorting.
 */

#include <iostream>
#include <vector>
#include <algorithm>
#include <queue>
#include <stack>
#include <cmath>

using namespace std;

// ============================================================================
// GENERATION (Sinh ke tiep)
// ============================================================================

// Next Binary String
void nextBinary(string &s) {
    int i = s.length() - 1;
    while (i >= 0 && s[i] == '1') {
        s[i] = '0';
        i--;
    }
    if (i >= 0) s[i] = '1';
}

// Next Permutation
bool nextPermutation(vector<int> &a) {
    int n = a.size();
    int i = n - 2;
    while (i >= 0 && a[i] >= a[i + 1]) i--;
    if (i < 0) return false; // Last permutation
    
    int k = n - 1;
    while (a[k] <= a[i]) k--;
    swap(a[i], a[k]);
    
    int l = i + 1, r = n - 1;
    while (l < r) {
        swap(a[l], a[r]);
        l++; r--;
    }
    return true;
}

// ============================================================================
// GRAPH ALGORITHMS (BFS/DFS)
// ============================================================================

// BFS for unweighted graph
void bfs(int start, int V, vector<vector<int>> &adj) {
    vector<bool> visited(V + 1, false);
    queue<int> q;
    
    q.push(start);
    visited[start] = true;
    
    cout << "BFS(" << start << "): ";
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        cout << u << " ";
        
        for (int v : adj[u]) {
            if (!visited[v]) {
                visited[v] = true;
                q.push(v);
            }
        }
    }
    cout << endl;
}

// DFS Recursive
void dfsUtil(int u, vector<vector<int>> &adj, vector<bool> &visited) {
    visited[u] = true;
    cout << u << " ";
    for (int v : adj[u]) {
        if (!visited[v]) {
            dfsUtil(v, adj, visited);
        }
    }
}

void dfs(int start, int V, vector<vector<int>> &adj) {
    vector<bool> visited(V + 1, false);
    cout << "DFS(" << start << "): ";
    dfsUtil(start, adj, visited);
    cout << endl;
}

// ============================================================================
// ALGORITHMS
// ============================================================================

// Binary Search
int binarySearch(vector<int> &arr, int x) {
    int l = 0, r = arr.size() - 1;
    while (l <= r) {
        int m = l + (r - l) / 2;
        if (arr[m] == x) return m;
        if (arr[m] < x) l = m + 1;
        else r = m - 1;
    }
    return -1;
}

// ============================================================================
// MAIN DEMO
// ============================================================================

int main() {
    cout << "=== DSA Utilities Demo ===" << endl << endl;

    // 1. Generation Test
    string bin = "10101";
    cout << "Current Binary: " << bin << endl;
    nextBinary(bin);
    cout << "Next Binary:    " << bin << endl;

    // 2. Permutation Test
    vector<int> perm = {1, 2, 3};
    cout << "\nPermutations of {1, 2, 3}:" << endl;
    do {
        for (int x : perm) cout << x << " ";
        cout << endl;
    } while (nextPermutation(perm));

    // 3. Graph Test (Example Graph)
    // 1 -- 2
    // |    |
    // 3 -- 4
    int V = 4;
    vector<vector<int>> adj(V + 1);
    adj[1] = {2, 3};
    adj[2] = {1, 4};
    adj[3] = {1, 4};
    adj[4] = {2, 3};

    cout << "\nGraph Traversal:" << endl;
    bfs(1, V, adj);
    dfs(1, V, adj);

    return 0;
}
