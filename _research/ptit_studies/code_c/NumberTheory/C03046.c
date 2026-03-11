/*
 * Filename: C03046.c
 * Description: Calculates sums using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>
#include <stdbool.h>

bool check(int n)
{
    int N = n;
    int res = 0;
    int sum = 0;
    while (n > 0)
    {
        int x = n % 10;
        if (x == 4)
            return 0;
        sum += x;
        res = res * 10 + x;
        n /= 10;
    }
    if (res == N && sum % 10 == 0)
        return 1;
    return 0;
}

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    int l = pow(10, n - 1);
    int r = pow(10, n) - 1;
    for (int i = l; i <= r; i++)
        if (check(i))
            printf("%d ", i); // Print result
    printf("\n"); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}