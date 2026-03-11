/*
 * Filename: C03050.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int dd[100005] = {0};
    for (int i = 1; i < n; i++)
    {
        int a, b;
        scanf("%d %d", &a, &b); // Read input
        dd[a]++;
        dd[b]++;
    }
    for (int i = 1; i <= n; i++)
    {
        if (dd[i] != 1 && dd[i] != n - 1)
        {
            printf("No"); // Print result
            return 0;
        }
    }
    printf("Yes"); // Print result
    return 0;
}