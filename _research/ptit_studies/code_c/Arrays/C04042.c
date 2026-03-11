/*
 * Filename: C04042.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <stdbool.h>

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    long long a[100001];
    for (int i = 0; i < n; i++)
        scanf("%lld", &a[i]); // Read input
    bool check = 0;
    for (int i = 0; i < n - 1; i++)
    {
        for (int j = i + 1; j < n; j++)
            if (a[j] == a[i])
            {
                printf("%lld\n", a[i]); // Print result
                check = 1;
                break;
            }
        if (check)
            break;
    }
    if (check == 0)
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