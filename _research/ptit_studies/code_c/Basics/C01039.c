/*
 * Filename: C01039.c
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
    int dem = 0;
    while (n > 0)
    {
        n /= 10;
        dem++;
    }
    printf("%d", dem); // Print result
    return 0;
}