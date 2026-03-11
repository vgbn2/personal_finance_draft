/*
 * Filename: C04005.c
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

// Function to solve specific test case
void solve()
{
    int n;
    scanf("%d", &n); // Read input
    int a[101], max = 0;
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        if (a[i] > max)
            max = a[i];
    }
    printf("%d\n", max); // Print result
    for (int i = 0; i < n; i++)
        if (a[i] == max)
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