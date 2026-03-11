/*
 * Filename: C04003.c
 * Description: C Program using functions: sosanh, solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

int sosanh(int n, int a[101], int b[101])
{
    for (int i = 0; i < n; i++)
        if (a[i] != b[i])
            return 0;
    return 1;
}

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    int a[101], b[101];
    for (int i = 0, j = n - 1; i < n, j >= 0; i++, j--)
    {
        scanf("%lld", &a[i]); // Read input
        b[j] = a[i];
    }
    if (sosanh(n, a, b) == 1)
        printf("YES\n"); // Print result
    else
        printf("NO\n"); // Print result
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