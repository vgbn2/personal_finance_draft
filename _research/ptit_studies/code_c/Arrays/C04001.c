/*
 * Filename: C04001.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
    2
    5
    1 2 3 4 5
    6
   10 21 32 43 54 65
 * Output:
 *   2 4 
 *   10 32 54
 */

// Import standard libraries
#include <stdio.h>

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    int a[101];
    int b[101], nb = 0;
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        if (a[i] % 2 == 0)
            b[nb++] = a[i];
    }
    for (int i = 0; i < nb; i++)
        printf("%d ", b[i]); // Print result
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