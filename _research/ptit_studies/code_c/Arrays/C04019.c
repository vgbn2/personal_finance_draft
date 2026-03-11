/*
 * Filename: C04019.c
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
    int a[101];
    int dd[30001] = {0}, dem = 0;
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        dd[a[i]]++;
        if (dd[a[i]] > dem)
            dem = dd[a[i]];
    }
    for (int i = 0; i < n; i++)
    {
        if (dd[a[i]] == dem)
        {
            printf("%d ", a[i]); // Print result
            dd[a[i]] = 0;
        }
    }
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